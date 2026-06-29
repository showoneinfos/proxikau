// api/stripe.js — Proxikau
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const BASE_URL = process.env.BASE_URL || 'https://proxikau.com';

export default async function handler(req, res) {

  const action = req.query.action;

  // WEBHOOK
  if (req.method === 'POST' && !action) {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
      const rawBody = await getRawBody(req);
      event = stripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET);
    } catch (err) {
      return res.status(400).json({ error: 'Webhook signature invalide' });
    }

    // ✅ Paiement confirmé — mettre à jour commandes ET envoyer emails
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const commande_ids = session.metadata?.commande_id?.split(',') || [];

      try {
        const { createClient } = await import('@supabase/supabase-js');
        const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

        for (const commande_id of commande_ids) {
          const id = commande_id.trim();

          // 1. Mettre à jour le statut
          await db.from('commandes').update({
            statut: 'payee',
            stripe_session_id: session.id,
            stripe_payment_intent: session.payment_intent
          }).eq('id', id);

          // 2. Récupérer les infos complètes pour l'email
          const { data: commande } = await db
            .from('commandes')
            .select(`
              *,
              boutiques (nom, email_contact),
              commande_lignes (nom_produit, quantite, prix_unitaire)
            `)
            .eq('id', id)
            .single();

          if (!commande) continue;

          const vendeurEmail = commande.boutiques?.email_contact;
          const boutique_nom = commande.boutiques?.nom || '';
          const adresse = commande.adresse_livraison || {};

          // 3. Envoyer email au vendeur
          if (vendeurEmail) {
            try {
              await fetch(`${BASE_URL}/api/send-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  vendeur_email: vendeurEmail,
                  boutique_nom,
                  commande_id: commande.id,
                  produits: commande.commande_lignes.map(l => ({
                    nom: l.nom_produit,
                    qty: l.quantite,
                    prix: l.prix_unitaire
                  })),
                  mode_livraison: commande.mode_livraison,
                  adresse: ['colis','proximite'].includes(commande.mode_livraison) ? adresse : null,
                  acheteur_nom: (adresse.prenom || '') + ' ' + (adresse.nom || ''),
                  acheteur_email: adresse.email || '',
                  acheteur_tel: adresse.telephone || '',
                  montant_total: commande.montant_total
                })
              });
            } catch (emailErr) {
              console.error('Erreur email vendeur:', emailErr.message);
            }
          }
        }
      } catch (e) {
        console.error('Erreur webhook checkout.session.completed:', e.message);
      }
    }

    if (event.type === 'account.updated') {
      const account = event.data.object;
      if (account.details_submitted && account.charges_enabled) {
        try {
          const { createClient } = await import('@supabase/supabase-js');
          const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
          await db.from('boutiques').update({ stripe_verified: true }).eq('stripe_account_id', account.id);
        } catch (e) { console.error('Erreur update boutique:', e.message); }
      }
    }

    return res.status(200).json({ received: true });
  }

  // ONBOARDING VENDEUR
  if (req.method === 'POST' && action === 'onboarding') {
    const { boutique_id, boutique_nom, email } = req.body;
    if (!boutique_id || !email) return res.status(400).json({ error: 'boutique_id et email requis' });

    try {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'FR',
        email,
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        business_type: 'individual',
        business_profile: { name: boutique_nom, mcc: '5999', url: `${BASE_URL}/boutique.html?slug=${boutique_id}` },
        metadata: { boutique_id }
      });

      const { createClient } = await import('@supabase/supabase-js');
      const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      await db.from('boutiques').update({ stripe_account_id: account.id, stripe_verified: false }).eq('id', boutique_id);

      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: `${BASE_URL}/dashboard.html?stripe=refresh`,
        return_url: `${BASE_URL}/dashboard.html?stripe=success`,
        type: 'account_onboarding',
      });

      return res.status(200).json({ url: accountLink.url });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ONBOARDING LINK (compte existant)
  if (req.method === 'POST' && action === 'onboarding-link') {
    const { stripe_account_id } = req.body;
    if (!stripe_account_id) return res.status(400).json({ error: 'stripe_account_id requis' });
    try {
      const accountLink = await stripe.accountLinks.create({
        account: stripe_account_id,
        refresh_url: `${BASE_URL}/dashboard.html?stripe=refresh`,
        return_url: `${BASE_URL}/dashboard.html?stripe=success`,
        type: 'account_onboarding',
      });
      return res.status(200).json({ url: accountLink.url });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // CHECKOUT
  if (req.method === 'POST' && action === 'checkout') {
    const { commandes, acheteur_email } = req.body;
    if (!commandes || !commandes.length) return res.status(400).json({ error: 'commandes requises' });

    try {
      const line_items = [];
      for (const cmd of commandes) {
        for (const item of cmd.items) {
          line_items.push({
            price_data: {
              currency: 'eur',
              product_data: { name: item.nom, description: `${cmd.boutique_nom} · x${item.qty}` },
              unit_amount: Math.round(item.prix * 100)
            },
            quantity: item.qty
          });
        }
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items,
        mode: 'payment',
        customer_email: acheteur_email,
        success_url: `${BASE_URL}/mes-commandes.html?paiement=ok`,
        cancel_url: `${BASE_URL}/checkout.html?paiement=annule`,
        metadata: {
          commande_id: commandes.map(c => c.commande_id).join(','),
          boutique_ids: commandes.map(c => c.boutique_id).join(',')
        },
        payment_intent_data: { transfer_group: `group_${Date.now()}` }
      });

      return res.status(200).json({ url: session.url, session_id: session.id });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // TRANSFER VENDEUR J+30
  if (req.method === 'POST' && action === 'transfer') {
    const { commande_id, stripe_account_id, montant_vendeur, payment_intent } = req.body;
    if (!stripe_account_id || !montant_vendeur || !payment_intent) return res.status(400).json({ error: 'Données manquantes' });
    try {
      const transfer = await stripe.transfers.create({
        amount: Math.round(montant_vendeur * 100),
        currency: 'eur',
        destination: stripe_account_id,
        source_transaction: payment_intent,
        metadata: { commande_id }
      });
      return res.status(200).json({ transfer_id: transfer.id });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(404).json({ error: 'Action non reconnue' });
}

export const config = { api: { bodyParser: false } };

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
