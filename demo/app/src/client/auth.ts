export function getAuth(): { token: string; apiUrl: string; user: any } | null {
  const token = sessionStorage.getItem('opencall_token');
  const apiUrl = sessionStorage.getItem('opencall_api_url');
  const userJson = sessionStorage.getItem('opencall_user');

  if (!token || !apiUrl) {
    return null;
  }

  const user = userJson ? JSON.parse(userJson) : null;

  // Check expiry
  if (user && user.expiresAt && Date.now() / 1000 > user.expiresAt) {
    sessionStorage.clear();
    return null;
  }

  return { token, apiUrl, user };
}

export function logout() {
  sessionStorage.clear();
  window.location.href = '/logout';
}
