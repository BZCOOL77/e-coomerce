function getHeaders() {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''// Si le token existe, on l'ajoute, sinon on laisse vide et il verifie meme le role dans le backend si vendeur ou client
    };
}