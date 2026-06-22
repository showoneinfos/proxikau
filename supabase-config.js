// ============================================
// PROXIKAU.COM - Configuration Supabase
// ============================================

const SUPABASE_URL = 'https://dglrjahtxflguhosqbnr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_5Y9KjUWoXPunmNJlefGHrQ_DYsqRs6q';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// AUTH
// ============================================

async function inscrireUtilisateur(email, motDePasse, prenom, nom, telephone) {
  const { data, error } = await db.auth.signUp({
    email,
    password: motDePasse,
    options: { data: { prenom, nom, telephone } }
  });
  if (error) throw error;
  return data;
}

async function connecterUtilisateur(email, motDePasse) {
  const { data, error } = await db.auth.signInWithPassword({ email, password: motDePasse });
  if (error) throw error;
  return data;
}

async function deconnecterUtilisateur() {
  const { error } = await db.auth.signOut();
  if (error) throw error;
}

async function getUtilisateurConnecte() {
  const { data: { user } } = await db.auth.getUser();
  return user;
}

// ============================================
// UTILISATEURS
// ============================================

async function creerProfil(userId, email, prenom, nom, telephone, role) {
  const { data, error } = await db.from('utilisateurs').insert([{
    id: userId, email, prenom, nom, telephone, role
  }]).select();
  if (error) throw error;
  return data[0];
}

async function getProfil(userId) {
  const { data, error } = await db.from('utilisateurs').select('*').eq('id', userId).single();
  if (error) throw error;
  return data;
}

// ============================================
// BOUTIQUES
// ============================================

async function slugDisponible(slug) {
  const { data, error } = await db.rpc('slug_disponible', { p_slug: slug });
  if (error) throw error;
  return data;
}

async function creerBoutique(boutique) {
  const user = await getUtilisateurConnecte();
  if (!user) throw new Error('Non connecte');
  const { data, error } = await db.from('boutiques').insert([{
    ...boutique,
    user_id: user.id
  }]).select();
  if (error) throw error;
  return data[0];
}

async function getBoutiqueParSlug(slug) {
  const { data, error } = await db.from('boutiques')
    .select('*, utilisateurs(prenom, nom, email)')
    .eq('slug', slug)
    .eq('actif', true)
    .single();
  if (error) throw error;
  return data;
}

async function getBoutiqueParUserId(userId) {
  const { data, error } = await db.from('boutiques')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error) return null;
  return data;
}

async function majBoutique(boutiqueId, updates) {
  const { data, error } = await db.from('boutiques')
    .update(updates)
    .eq('id', boutiqueId)
    .select();
  if (error) throw error;
  return data[0];
}

// ============================================
// PRODUITS
// ============================================

async function creerProduit(produit) {
  const user = await getUtilisateurConnecte();
  if (!user) throw new Error('Non connecte');
  const { data, error } = await db.from('produits').insert([{
    ...produit,
    user_id: user.id
  }]).select();
  if (error) throw error;
  return data[0];
}

async function getProduitsBoutique(boutiqueId) {
  const { data, error } = await db.from('produits')
    .select('*')
    .eq('boutique_id', boutiqueId)
    .eq('disponible', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function getProduitsBoutiqueVendeur(boutiqueId) {
  // Sans filtre disponible pour le dashboard vendeur
  const { data, error } = await db.from('produits')
    .select('*')
    .eq('boutique_id', boutiqueId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function majProduit(produitId, updates) {
  const { data, error } = await db.from('produits')
    .update(updates)
    .eq('id', produitId)
    .select();
  if (error) throw error;
  return data[0];
}

async function supprimerProduit(produitId) {
  const { error } = await db.from('produits').delete().eq('id', produitId);
  if (error) throw error;
}

// ============================================
// COMMANDES
// ============================================

async function creerCommande(commande) {
  const user = await getUtilisateurConnecte();
  if (!user) throw new Error('Non connecte');
  const commission = Math.round(commande.montant_produits * 0.05 * 100) / 100;
  const { data, error } = await db.from('commandes').insert([{
    ...commande,
    acheteur_id: user.id,
    commission_proxikau: commission,
    montant_vendeur: commande.montant_produits - commission,
    paiement_vendeur_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  }]).select();
  if (error) throw error;
  return data[0];
}

async function getCommandesAcheteur() {
  const user = await getUtilisateurConnecte();
  if (!user) throw new Error('Non connecte');
  const { data, error } = await db.from('commandes')
    .select('*, boutiques(nom, slug), commande_lignes(*)')
    .eq('acheteur_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function getCommandesBoutique(boutiqueId) {
  const { data, error } = await db.from('commandes')
    .select('*, utilisateurs(prenom, nom, email), commande_lignes(*)')
    .eq('boutique_id', boutiqueId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// ============================================
// BOOSTS
// ============================================

const BOOST_PRIX = { region: 10, france: 15, europe: 20 };
const BOOST_LABELS = { region: 'Ma Region', france: 'France', europe: 'Europe' };

async function getBoutiquesBoostees(type) {
  const now = new Date().toISOString();
  let query = db.from('boutiques')
    .select('*, produits(id, nom, prix, photos)')
    .eq('boost_actif', true)
    .eq('actif', true)
    .gt('boost_expire_at', now);
  if (type) query = query.eq('boost_type', type);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// ============================================
// UPLOAD PHOTOS (Supabase Storage)
// ============================================

async function uploadPhoto(file, dossier) {
  const user = await getUtilisateurConnecte();
  if (!user) throw new Error('Non connecte');
  const ext = file.name.split('.').pop();
  const nom = `${dossier}/${user.id}/${Date.now()}.${ext}`;
  const { data, error } = await db.storage.from('proxikau-photos').upload(nom, file, {
    cacheControl: '3600',
    upsert: false
  });
  if (error) throw error;
  const { data: urlData } = db.storage.from('proxikau-photos').getPublicUrl(nom);
  return urlData.publicUrl;
}

