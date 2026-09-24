/**
 * Rendu réutilisable des étoiles de notation avec remplissage partiel.
 *
 * Exemple : 4.5 => 4 étoiles pleines + 1 étoile remplie à 50%.
 * Cette fonction est conçue pour être réutilisée sur plusieurs pages :
 * - fiche produit
 * - catalogue
 * - wishlist
 * - autres écrans de produits
 */
function renderProductRating(score, starsContainer, valueContainer) {
    if (!starsContainer || !valueContainer) {
        return;
    }

    const safeScore = Math.min(5, Math.max(0, Number(score) || 0));
    const fullStars = Math.floor(safeScore);
    const partialFill = safeScore - fullStars;

    const starsHtml = Array.from({ length: 5 }, (_, index) => {
        let fill = 0;

        if (index < fullStars) {
            fill = 100;
        } else if (index === fullStars) {
            fill = partialFill * 100;
        }

        return `<span class="partial-star" style="--fill:${Math.max(0, Math.min(100, fill))}%"></span>`;
    }).join('');

    starsContainer.innerHTML = starsHtml;
    valueContainer.textContent = `${safeScore.toFixed(1)}/5`;
}
