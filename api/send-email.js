// api/send-email.js — Proxikau
// Appelé par checkout.html après confirmation commande

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { vendeur_email, vendeur_nom, boutique_nom, commande_id, produits, mode_livraison, adresse, acheteur_nom, acheteur_email, acheteur_tel, montant_total } = req.body;

  if (!vendeur_email || !commande_id) return res.status(400).json({ error: 'Données manquantes' });

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

        <a href="https://proxikau.vercel.app/dashboard" style="display:inline-block;background:#2D6A4F;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Gérer ma commande →</a>
      </div>
      <div style="padding:16px 32px;background:#F9F7F4;border-top:1px solid #E0E0E0;font-size:12px;color:#999;text-align:center;">
        Proxikau — Marketplace des artisans et producteurs locaux
      </div>
    </div>`;

  // Email acheteur
  const emailAcheteur = `
    <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #E0E0E0;">
      <div style="background:linear-gradient(135deg,#1B4332,#2D6A4F);padding:28px 32px;">
        <div style="color:#fff;font-size:22px;font-weight:800;">Proxikau</div>
        <div style="color:rgba(255,255,255,.8);font-size:14px;margin-top:4px;">Commande confirmée ✅</div>
      </div>
      <div style="padding:28px 32px;">
        <h2 style="font-size:18px;font-weight:700;margin:0 0 6px;">Merci pour ta commande !</h2>
        <p style="color:#555;font-size:14px;margin:0 0 24px;">Ta commande chez <strong>${boutique_nom}</strong> a bien été reçue.</p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          <tbody>${produitsHTML}</tbody>
        </table>
        <div style="background:#F9F7F4;border-radius:10px;padding:16px;margin-bottom:20px;">
          <p style="margin:0;font-size:14px;"><strong>Mode de livraison :</strong> ${livLabel}</p>
          ${adresseHTML}
          <p style="margin:8px 0 0;font-size:14px;"><strong>Total :</strong> <span style="color:#2D6A4F;font-weight:700;">${parseFloat(montant_total).toFixed(2)}€</span></p>
        </div>
        <p style="color:#555;font-size:13px;">Le vendeur va préparer ta commande et te contacter si besoin.</p>
      </div>
      <div style="padding:16px 32px;background:#F9F7F4;border-top:1px solid #E0E0E0;font-size:12px;color:#999;text-align:center;">
        Proxikau — Marketplace des artisans et producteurs locaux
      </div>
    </div>`;

  try {
    // Email au vendeur
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` },
      body: JSON.stringify({
        from: 'Proxikau <onboarding@resend.dev>',
        to: [vendeur_email],
        subject: `🛒 Nouvelle commande — ${boutique_nom}`,
        html: emailVendeur
      })
    });

    // Email à l'acheteur
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` },
      body: JSON.stringify({
        from: 'Proxikau <onboarding@resend.dev>',
        to: [acheteur_email],
        subject: `✅ Commande confirmée — ${boutique_nom}`,
        html: emailAcheteur
      })
    });

    res.status(200).json({ success: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
