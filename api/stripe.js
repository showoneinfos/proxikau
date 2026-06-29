// api/stripe.js — Proxikau
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const BASE_URL = process.env.BASE_URL || 'https://proxikau.com';
const RESEND_API_KEY = process.env.RESEND_API_KEY;

async function envoyerEmail(to, subject, html) {
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`
    },
    body: JSON.stringify({
      from: 'Proxikau <noreply@proxikau.com>',
      to: [to],
      subject,
      html
    })
  });
}

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

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const commande_ids = session.metadata?.commande_id?.split(',') || [];

      try {
        const { createClient } = await import('@supabase/supabase-js');
        const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

        const commandesRecuperees = [];

        for (const commande_id of commande_ids) {
          const id = commande_id.trim();

          await db.from('commandes').update({
            statut: 'payee',
            stripe_session_id: session.id,
            stripe_payment_intent: session.payment_intent
          }).eq('id', id);

          const { data: commande } = await db
            .from('commandes')
            .select('*, boutiques(nom, email_contact), commande_lignes(nom_produit, quantite, prix_unitaire)')
            .eq('id', id)
            .single();

          if (commande) commandesRecuperees.push(commande);
        }

        if (!commandesRecuperees.length) return res.status(200).json({ received: true });

        const premiere = commandesRecuperees[0];
        const adresse = premiere.adresse_livraison || {};
        const acheteur_nom = `${adresse.prenom || ''} ${adresse.nom || ''}`.trim();
        const acheteur_email = adresse.email || '';
        const acheteur_tel = adresse.telephone || '';

        const livLabel = (mode) => ({ colis: '📦 Envoi par colis', enlevement: '🏠 Enlèvement sur place', proximite: '🚗 Livraison à proximité' }[mode] || mode);

        // ✅ Email vendeur — un par boutique
        for (const commande of commandesRecuperees) {
          const vendeurEmail = commande.boutiques?.email_contact;
          if (!vendeurEmail) continue;

          const produitsHTML = commande.commande_lignes.map(l =>
            `<tr>
              <td style="padding:8px 0;border-bottom:1px solid #eee;">${l.nom_produit}</td>
              <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:center;">x${l.quantite}</td>
              <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:600;color:#2D6A4F;">${(l.prix_unitaire * l.quantite).toFixed(2)}€</td>
            </tr>`
          ).join('');

          const addr = commande.adresse_livraison || {};
          const adresseHTML = ['colis','proximite'].includes(commande.mode_livraison) && addr.rue
            ? `<p style="margin:0;"><strong>Adresse :</strong> ${addr.rue}, ${addr.cp} ${addr.ville}</p>` : '';

          const htmlVendeur = `
            <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #E0E0E0;">
              <div style="background:linear-gradient(135deg,#1B4332,#2D6A4F);padding:28px 32px;">
                <div style="color:#fff;font-size:22px;font-weight:800;">Proxikau</div>
                <div style="color:rgba(255,255,255,.8);font-size:14px;margin-top:4px;">Nouvelle commande reçue 🎉</div>
              </div>
              <div style="padding:28px 32px;">
                <h2 style="font-size:18px;font-weight:700;margin:0 0 6px;">Tu as une nouvelle commande !</h2>
                <p style="color:#555;font-size:14px;margin:0 0 24px;">Commande #${commande.id.substring(0,8).toUpperCase()} — <strong>${commande.boutiques?.nom}</strong></p>
                <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
                  <thead><tr>
                    <th style="text-align:left;font-size:12px;color:#999;text-transform:uppercase;padding-bottom:8px;border-bottom:2px solid #eee;">Produit</th>
                    <th style="text-align:center;font-size:12px;color:#999;text-transform:uppercase;padding-bottom:8px;border-bottom:2px solid #eee;">Qté</th>
                    <th style="text-align:right;font-size:12px;color:#999;text-transform:uppercase;padding-bottom:8px;border-bottom:2px solid #eee;">Total</th>
                  </tr></thead>
                  <tbody>${produitsHTML}</tbody>
                </table>
                <div style="background:#F9F7F4;border-radius:10px;padding:16px;margin-bottom:20px;">
                  <p style="margin:0 0 8px;font-weight:700;font-size:14px;">Livraison : ${livLabel(commande.mode_livraison)}</p>
                  ${adresseHTML}
                  <p style="margin:8px 0 0;font-size:14px;"><strong>Montant :</strong> <span style="color:#2D6A4F;font-weight:700;">${parseFloat(commande.montant_total).toFixed(2)}€</span></p>
                </div>
                <div style="border:1px solid #E0E0E0;border-radius:10px;padding:16px;margin-bottom:24px;">
                  <p style="margin:0 0 6px;font-weight:700;font-size:14px;">Coordonnées acheteur</p>
                  <p style="margin:0;font-size:14px;color:#555;">${acheteur_nom}</p>
                  <p style="margin:0;font-size:14px;color:#555;">${acheteur_email}</p>
                  <p style="margin:0;font-size:14px;color:#555;">${acheteur_tel}</p>
                </div>
                <a href="https://proxikau.com/dashboard.html" style="display:inline-block;background:#2D6A4F;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Gérer ma commande →</a>
              </div>
              <div style="padding:16px 32px;background:#F9F7F4;border-top:1px solid #E0E0E0;font-size:12px;color:#999;text-align:center;">
                Proxikau — Marketplace des artisans et producteurs locaux
              </div>
            </div>`;

          try {
            await envoyerEmail(vendeurEmail, `🛒 Nouvelle commande — ${commande.boutiques?.nom}`, htmlVendeur);
          } catch(e) { console.error('Erreur email vendeur:', e.message); }
        }

        // ✅ Email acheteur — un seul récap
        if (acheteur_email) {
          const commandesHTML = commandesRecuperees.map(c => {
            const produitsHTML = c.commande_lignes.map(l =>
              `<tr>
                <td style="padding:6px 0;border-bottom:1px solid #eee;font-size:14px;">${l.nom_produit}</td>
                <td style="padding:6px 0;border-bottom:1px solid #eee;text-align:center;font-size:14px;">x${l.quantite}</td>
                <td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;font-weight:600;color:#2D6A4F;font-size:14px;">${(l.prix_unitaire * l.quantite).toFixed(2)}€</td>
              </tr>`
            ).join('');
            const addr = c.adresse_livraison || {};
            const adresseHTML = ['colis','proximite'].includes(c.mode_livraison) && addr.rue
              ? `<p style="margin:4px 0 0;font-size:13px;color:#555;">Adresse : ${addr.rue}, ${addr.cp} ${addr.ville}</p>` : '';
            return `
              <div style="margin-bottom:20px;border:1px solid #E0E0E0;border-radius:10px;overflow:hidden;">
                <div style="background:#F9F7F4;padding:12px 16px;font-weight:700;font-size:14px;color:#1B4332;">🏪 ${c.boutiques?.nom}</div>
                <div style="padding:12px 16px;">
                  <table style="width:100%;border-collapse:collapse;">${produitsHTML}</table>
                  <div style="margin-top:10px;padding:10px;background:#F9F7F4;border-radius:8px;">
                    <p style="margin:0;font-size:13px;font-weight:600;">${livLabel(c.mode_livraison)}</p>
                    ${adresseHTML}
                    <p style="margin:6px 0 0;font-size:13px;">Sous-total : <strong style="color:#2D6A4F;">${parseFloat(c.montant_total).toFixed(2)}€</strong></p>
                  </div>
                </div>
              </div>`;
          }).join('');

          const totalGlobal = commandesRecuperees.reduce((s,c) => s + parseFloat(c.montant_total), 0);

          const htmlAcheteur = `
            <div style="font-family:Inter,sans-serif;max-width:580px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #E0E0E0;">
              <div style="background:linear-gradient(135deg,#1B4332,#2D6A4F);padding:28px 32px;">
                <div style="color:#fff;font-size:22px;font-weight:800;">Proxikau</div>
                <div style="color:rgba(255,255,255,.8);font-size:14px;margin-top:4px;">Commande confirmée ✅</div>
              </div>
              <div style="padding:28px 32px;">
                <h2 style="font-size:18px;font-weight:700;margin:0 0 6px;">Merci ${acheteur_nom} !</h2>
                <p style="color:#555;font-size:14px;margin:0 0 24px;">Voici le récapitulatif de ta commande :</p>
                ${commandesHTML}
                <div style="background:#D8F3DC;border-radius:10px;padding:14px 16px;text-align:center;">
                  <div style="font-size:13px;color:#1B4332;margin-bottom:4px;">Total payé</div>
                  <div style="font-size:24px;font-weight:800;color:#1B4332;">${totalGlobal.toFixed(2)}€</div>
                </div>
                <p style="color:#555;font-size:13px;margin-top:20px;">Les vendeurs vont préparer tes articles et te contacter si besoin.</p>
              </div>
              <div style="padding:16px 32px;background:#F9F7F4;border-top:1px solid #E0E0E0;font-size:12px;color:#999;text-align:center;">
                Proxikau — Marketplace des artisans et producteurs locaux
              </div>
            </div>`;

          try {
            await envoyerEmail(acheteur_email, `✅ Ta commande Proxikau est confirmée`, htmlAcheteur);
          } catch(e) { console.error('Erreur email acheteur:', e.message); }
        }

      } catch (e) {
        console.error('Erreur webhook:', e.message);
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
        type: 'express', country: 'FR', email,
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

  // ONBOARDING LINK
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
        success_url: `${BASE_URL}/mes-commandes.html?paiement=ok&email=${encodeURIComponent(acheteur_email)}`,
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
