// api/send-email.js — Proxikau
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, vendeur_email, vendeur_nom, boutique_nom, commande_id, produits, mode_livraison, adresse, acheteur_nom, acheteur_email, acheteur_tel, montant_total, toutes_commandes } = req.body;

  // Email récap acheteur multi-boutiques
  if (type === 'acheteur_recap') {
    const commandesHTML = (toutes_commandes || []).map(c => {
      const livLabel = { colis: '📦 Envoi par colis', enlevement: '🏠 Enlèvement sur place', proximite: '🚗 Livraison à proximité' }[c.mode_livraison] || c.mode_livraison;
      const produitsHTML = (c.produits || []).map(p =>
        `<tr><td style="padding:6px 0;border-bottom:1px solid #eee;font-size:14px;">${p.nom}</td><td style="padding:6px 0;border-bottom:1px solid #eee;text-align:center;font-size:14px;">x${p.qty}</td><td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;font-weight:600;color:#2D6A4F;font-size:14px;">${(p.prix * p.qty).toFixed(2)}€</td></tr>`
      ).join('');
      const adresseHTML = c.adresse && c.mode_livraison !== 'enlevement'
        ? `<p style="margin:4px 0 0;font-size:13px;color:#555;">Adresse : ${c.adresse.rue}, ${c.adresse.cp} ${c.adresse.ville}</p>` : '';
      return `
        <div style="margin-bottom:20px;border:1px solid #E0E0E0;border-radius:10px;overflow:hidden;">
          <div style="background:#F9F7F4;padding:12px 16px;font-weight:700;font-size:14px;color:#1B4332;">🏪 ${c.boutique_nom}</div>
          <div style="padding:12px 16px;">
            <table style="width:100%;border-collapse:collapse;">${produitsHTML}</table>
            <div style="margin-top:10px;padding:10px;background:#F9F7F4;border-radius:8px;">
              <p style="margin:0;font-size:13px;font-weight:600;">${livLabel}</p>
              ${adresseHTML}
              <p style="margin:6px 0 0;font-size:13px;">Sous-total : <strong style="color:#2D6A4F;">${parseFloat(c.montant).toFixed(2)}€</strong></p>
            </div>
          </div>
        </div>`;
    }).join('');

    const totalGlobal = (toutes_commandes || []).reduce((s,c) => s + parseFloat(c.montant), 0);

    const htmlAcheteur = `
      <div style="font-family:Inter,sans-serif;max-width:580px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #E0E0E0;">
        <div style="background:linear-gradient(135deg,#1B4332,#2D6A4F);padding:28px 32px;">
          <div style="color:#fff;font-size:22px;font-weight:800;">Proxikau</div>
          <div style="color:rgba(255,255,255,.8);font-size:14px;margin-top:4px;">Récapitulatif de ta commande ✅</div>
        </div>
        <div style="padding:28px 32px;">
          <h2 style="font-size:18px;font-weight:700;margin:0 0 6px;">Merci ${acheteur_nom} !</h2>
          <p style="color:#555;font-size:14px;margin:0 0 24px;">Voici le récapitulatif de tes ${toutes_commandes.length} commande${toutes_commandes.length > 1 ? 's' : ''} :</p>
          ${commandesHTML}
          <div style="background:#D8F3DC;border-radius:10px;padding:14px 16px;text-align:center;">
            <div style="font-size:13px;color:#1B4332;margin-bottom:4px;">Total de ta commande</div>
            <div style="font-size:24px;font-weight:800;color:#1B4332;">${totalGlobal.toFixed(2)}€</div>
          </div>
          <p style="color:#555;font-size:13px;margin-top:20px;">Les vendeurs vont préparer tes articles et te contacter si besoin.</p>
        </div>
        <div style="padding:16px 32px;background:#F9F7F4;border-top:1px solid #E0E0E0;font-size:12px;color:#999;text-align:center;">
          Proxikau — Marketplace des artisans et producteurs locaux
        </div>
      </div>`;

    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` },
        body: JSON.stringify({
          from: 'Proxikau <noreply@proxikau.com>',
          to: [acheteur_email],
          subject: `✅ Tes ${toutes_commandes.length} commandes Proxikau sont confirmées`,
          html: htmlAcheteur
        })
      });
      return res.status(200).json({ success: true });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // Email bienvenue vendeur
  if (type === 'bienvenue_vendeur') {
    const { vendeur_nom, boutique_nom, boutique_slug } = req.body;
    const htmlBienvenue = `
      <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #E0E0E0;">
        <div style="background:linear-gradient(135deg,#1B4332,#2D6A4F);padding:28px 32px;">
          <div style="color:#fff;font-size:22px;font-weight:800;">Proxikau</div>
          <div style="color:rgba(255,255,255,.8);font-size:14px;margin-top:4px;">Bienvenue sur Proxikau ! 🎉</div>
        </div>
        <div style="padding:28px 32px;">
          <h2 style="font-size:18px;font-weight:700;margin:0 0 12px;">Bonjour ${vendeur_nom} !</h2>
          <p style="color:#555;font-size:14px;margin:0 0 16px;line-height:1.6;">Ta boutique <strong>${boutique_nom}</strong> est maintenant créée sur Proxikau. 🚀</p>
          <p style="color:#555;font-size:14px;margin:0 0 24px;line-height:1.6;">Tu peux dès maintenant ajouter tes produits et commencer à vendre.</p>
          <div style="background:#F9F7F4;border-radius:10px;padding:16px;margin-bottom:24px;">
            <p style="margin:0;font-size:14px;">🔗 Ta vitrine : <a href="https://proxikau.com/boutique.html?slug=${boutique_slug}" style="color:#2D6A4F;font-weight:700;">proxikau.com/boutique</a></p>
          </div>
          <a href="https://proxikau.com/dashboard.html" style="display:inline-block;background:#2D6A4F;color:#fff;padding:13px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Accéder à mon dashboard →</a>
          <p style="color:#999;font-size:12px;margin-top:20px;line-height:1.5;">Commission de 5% par vente seulement. Paiement sur ton compte à J+30.</p>
        </div>
        <div style="padding:16px 32px;background:#F9F7F4;border-top:1px solid #E0E0E0;font-size:12px;color:#999;text-align:center;">
          Proxikau — Marketplace des artisans et producteurs locaux
        </div>
      </div>`;
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` },
        body: JSON.stringify({
          from: 'Proxikau <noreply@proxikau.com>',
          to: [vendeur_email],
          subject: `🎉 Ta boutique ${boutique_nom} est créée sur Proxikau !`,
          html: htmlBienvenue
        })
      });
      return res.status(200).json({ success: true });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // Email vendeur nouvelle commande + email acheteur
  if (!vendeur_email) return res.status(400).json({ error: 'Données manquantes' });
  if (!commande_id) return res.status(400).json({ error: 'Commande manquante' });

  const livLabel = { colis: '📦 Envoi par colis', enlevement: '🏠 Enlèvement sur place', proximite: '🚗 Livraison à proximité' }[mode_livraison] || mode_livraison;

  const produitsHTML = (produits || []).map(p =>
    `<tr><td style="padding:8px 0;border-bottom:1px solid #eee;">${p.nom}</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:center;">x${p.qty}</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:600;color:#2D6A4F;">${(p.prix * p.qty).toFixed(2)}€</td></tr>`
  ).join('');

  const adresseHTML = adresse && mode_livraison === 'colis'
    ? `<p style="margin:0;"><strong>Adresse :</strong> ${adresse.rue}, ${adresse.cp} ${adresse.ville}, ${adresse.pays}</p>`
    : '';

  const emailVendeur = `
    <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #E0E0E0;">
      <div style="background:linear-gradient(135deg,#1B4332,#2D6A4F);padding:28px 32px;">
        <div style="color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">Proxikau</div>
        <div style="color:rgba(255,255,255,.8);font-size:14px;margin-top:4px;">Nouvelle commande reçue 🎉</div>
      </div>
      <div style="padding:28px 32px;">
        <h2 style="font-size:18px;font-weight:700;color:#1A1A1A;margin:0 0 6px;">Tu as une nouvelle commande !</h2>
        <p style="color:#555;font-size:14px;margin:0 0 24px;">Commande #${commande_id.substring(0,8).toUpperCase()} pour ta boutique <strong>${boutique_nom}</strong></p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          <thead><tr>
            <th style="text-align:left;font-size:12px;color:#999;text-transform:uppercase;padding-bottom:8px;border-bottom:2px solid #eee;">Produit</th>
            <th style="text-align:center;font-size:12px;color:#999;text-transform:uppercase;padding-bottom:8px;border-bottom:2px solid #eee;">Qté</th>
            <th style="text-align:right;font-size:12px;color:#999;text-transform:uppercase;padding-bottom:8px;border-bottom:2px solid #eee;">Total</th>
          </tr></thead>
          <tbody>${produitsHTML}</tbody>
        </table>
        <div style="background:#F9F7F4;border-radius:10px;padding:16px;margin-bottom:20px;">
          <p style="margin:0 0 8px;font-weight:700;font-size:14px;color:#1A1A1A;">Livraison : ${livLabel}</p>
          ${adresseHTML}
          <p style="margin:8px 0 0;font-size:14px;color:#555;"><strong>Montant total :</strong> <span style="color:#2D6A4F;font-weight:700;">${parseFloat(montant_total).toFixed(2)}€</span></p>
        </div>
        <div style="background:#fff;border:1px solid #E0E0E0;border-radius:10px;padding:16px;margin-bottom:24px;">
          <p style="margin:0 0 6px;font-weight:700;font-size:14px;">Coordonnées acheteur</p>
          <p style="margin:0;font-size:14px;color:#555;">${acheteur_nom}</p>
          <p style="margin:0;font-size:14px;color:#555;">${acheteur_email}</p>
          <p style="margin:0;font-size:14px;color:#555;">${acheteur_tel}</p>
        </div>
        <a href="https://proxikau.com/dashboard.html" style="display:inline-block;background:#2D6A4F;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Gérer ma commande →</a>
      </div>
      <div style="padding:16px 32px;background:#F9F7F4;border-top:1px solid #E0E0E0;font-size:12px;color:#999;text-align:center;">
        Proxikau — Marketplace des artisans et producteurs locaux
      </div>
    </div>`;

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` },
      body: JSON.stringify({
        from: 'Proxikau <noreply@proxikau.com>',
        to: [vendeur_email],
        subject: `🛒 Nouvelle commande — ${boutique_nom}`,
        html: emailVendeur
      })
    });
    return res.status(200).json({ success: true });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
