const form = document.querySelector("form");
const steps = [...document.querySelectorAll(".form-step")];
const paymentError = document.querySelector("#payment-error");
const typePaiement = document.querySelector("#typePaiement");
const coordonneesPaiement = document.querySelector("#coordonneesPaiement");
const labelCoordonnees = document.querySelector("#label-coordonnees");
const geoStatus = document.querySelector("#geoStatus");
const submitButton = form.querySelector("button[type='submit']");
const devenirVendeurUrl = `${CONFIG.API_BASE_URL}/api/auth/me/devenir-vendeur`;
let currentStep = 0;
// Les coordonnées sont conservées après la capture GPS jusqu'à l'envoi du formulaire.
let clientLat = null;
let clientLng = null;

//geo-localisation
document.getElementById('btnGeoloc').addEventListener('click', () => {
    const status = document.getElementById('geoStatus');

    if (!navigator.geolocation) {
        status.textContent = "La géolocalisation n'est pas supportée par votre navigateur.";
        return;
    }

    status.textContent = "Recherche de votre position...";
    status.style.color = "#6a7280";

    navigator.geolocation.getCurrentPosition(
        (position) => {
            clientLat = position.coords.latitude;
            clientLng = position.coords.longitude;
            status.textContent = `Position capturée ! (${clientLat.toFixed(4)}, ${clientLng.toFixed(4)})`;
            status.style.color = "#28a745";
        },
        (error) => {
            console.error("Erreur de géolocalisation", error);
            status.textContent = "Impossible de récupérer votre position. Saisissez votre adresse manuellement.";
            status.style.color = "#dc3545";
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
});

function showStep(stepIndex) {
    steps.forEach((step, index) => {
        const isActive = index === stepIndex;
        step.hidden = !isActive;
        step.classList.toggle("is-active", isActive);
    });
    currentStep = stepIndex;
    window.scrollTo({ top: 0, behavior: "smooth" });
}

// Étape 1 : valider les informations de la boutique avant de continuer.
document.querySelector("[data-next]").addEventListener("click", () => {
    const stepFields = steps[0].querySelectorAll("input, select, textarea");
    const invalidField = [...stepFields].find((field) => !field.checkValidity());

    if (invalidField) {
        invalidField.reportValidity();
        return;
    }

    showStep(1);
});

// Étape 2 : revenir modifier les informations de la boutique.
document.querySelector("[data-previous]").addEventListener("click", () => {
    showStep(0);
});

function gererChangementPaiement(type) {
    const isIban = type === "IBAN";
    labelCoordonnees.textContent = isIban ? "NUMÉRO DE COMPTE / IBAN" : "NUMÉRO MOBILE MONEY";
    coordonneesPaiement.placeholder = isIban ? "Ex : CD59 1234 5678 9012..." : "Ex : 0812345678";
    coordonneesPaiement.inputMode = isIban ? "text" : "tel";
}

typePaiement.addEventListener("change", (event) => {
    gererChangementPaiement(event.target.value);
});

coordonneesPaiement.addEventListener("input", () => {
    if (coordonneesPaiement.value.trim()) {
        paymentError.hidden = true;
    }
});

gererChangementPaiement(typePaiement.value);

function createSellerPayload() {
    const categorieBoutique = document.querySelector("input[name='categorieBoutique']:checked");
    const coordonnees = coordonneesPaiement.value.trim();

    return {
        nomBoutique: document.querySelector("[name='nomBoutique']").value.trim(),
        descriptionBoutique: document.querySelector("[name='descriptionBoutique']").value.trim(),
        categorieBoutique: categorieBoutique.value,
        solutionPaiement: `${typePaiement.value}: ${coordonnees}`,
        moyenPaiement: typePaiement.value,
        coordonneesPaiement: coordonnees,
        villeBoutique: document.querySelector("[name='villeBoutique']").value,
        communeBoutique: document.querySelector("[name='communeBoutique']").value,
        quartierBoutique: document.querySelector("[name='quartierBoutique']").value.trim(),
        avenueBoutique: document.querySelector("[name='avenueBoutique']").value.trim(),
        numeroadresseBoutique: document.querySelector("[name='numeroadresseBoutique']").value.trim(),
        typeLocalBoutique: document.querySelector("[name='typeLocalBoutique']").value.trim(),
        telephoneBoutique: document.querySelector("[name='telephoneBoutique']").value.trim(),
        // Le modèle MongoDB attend les noms latitudeBoutique et longitudeBoutique.
        latitudeBoutique: clientLat,
        longitudeBoutique: clientLng,
        photoBoutique: document.querySelector("[name='photoBoutique']").value.trim()
    };
}

// Soumission : contrôler l'étape 2 puis envoyer les neuf informations à l'API.
form.addEventListener("submit", async (event) => {
    event.preventDefault();

    // On vérifie explicitement les champs HTML avant de lancer la requête API.
    if (!form.checkValidity()) {
        // On affiche au navigateur le premier champ qui empêche la soumission.
        form.reportValidity();
        return;
    }

    // On récupère le token existant pour authentifier la demande de changement de rôle.
    const token = localStorage.getItem("token");
    // On empêche l'envoi d'une requête invalide si l'utilisateur n'est pas connecté.
    if (!token || token === "null" || token === "undefined") {
        alert("Votre session a expiré. Veuillez vous reconnecter avant de créer votre boutique.");
        return;
    }

    if (!coordonneesPaiement.value.trim()) {
        paymentError.hidden = false;
        coordonneesPaiement.focus();
        return;
    }

    paymentError.hidden = true;
    submitButton.disabled = true;
    submitButton.textContent = "Envoi en cours...";

    try {
            // Éviter que le bouton reste bloqué si le serveur ne répond pas.
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(devenirVendeurUrl, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                // On transmet le token vérifié pour que le middleware auth identifie l'utilisateur.
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify(createSellerPayload()),
            signal: controller.signal
        });
            clearTimeout(timeoutId);
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            // On conserve le message détaillé envoyé par le backend pour diagnostiquer le blocage.
            throw new Error(data.error?.message || data.error || data.message || "Impossible de créer la boutique.");
        }

        if (data.token) {
            localStorage.setItem("token", data.token);
        }
        localStorage.setItem("role", data.role || "vendeur");

        alert("Votre demande pour devenir vendeur a bien été enregistrée.");
        window.location.href = "../html/client.html";
    } catch (error) {
        // On affiche la cause réelle afin que l'utilisateur sache pourquoi la soumission a échoué.
        alert(`Création de la boutique impossible : ${error.message}`);
        console.error("Erreur lors de la création de la boutique :", error);
        geoStatus.textContent = error.message || "Le serveur ne répond pas.";
        geoStatus.style.color = "#b42318";
        submitButton.disabled = false;
        submitButton.textContent = "Créer ma boutique";
    }
});




