// js/webauthn.js - Utilidades nativas WebAuthn (Biometría / Llaves de Seguridad)
// Soporta Windows Hello, Touch ID, Face ID, huella dactilar Android y llaves físicas.

// Helpers para conversión entre ArrayBuffer y Base64URL
export function bufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function base64UrlToBuffer(base64url) {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Verifica si el dispositivo actual soporta biometría / autenticador de plataforma
 * (Touch ID, Windows Hello, Huella digital móvil).
 */
export async function isBiometricsAvailable() {
  try {
    if (!window.PublicKeyCredential) {
      return false;
    }
    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') {
      return false;
    }
    const disponible = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return Boolean(disponible);
  } catch (e) {
    console.warn("Error evaluando disponibilidad de autenticador de plataforma:", e);
    return false;
  }
}

/**
 * Registra una nueva credencial biométrica para el usuario en este dispositivo.
 */
export async function registrarCredencialBiometrica(username) {
  if (!window.PublicKeyCredential) {
    throw new Error("Este navegador no soporta autenticación WebAuthn.");
  }

  const u = String(username || "usuario").trim();
  const userIdBuffer = new TextEncoder().encode(u);
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  // Opciones de creación de credencial
  const publicKeyCredentialCreationOptions = {
    challenge: challenge,
    rp: {
      name: "CRONO-PCT",
      id: window.location.hostname
    },
    user: {
      id: userIdBuffer,
      name: u,
      displayName: u
    },
    pubKeyCredParams: [
      { alg: -7, type: "public-key" },  // ES256 (estándar FIDO2)
      { alg: -257, type: "public-key" } // RS256
    ],
    authenticatorSelection: {
      authenticatorAttachment: "platform", // Sensor local (huella, rostro, pin de dispositivo)
      userVerification: "required",
      residentKey: "preferred"
    },
    timeout: 60000,
    attestation: "none"
  };

  const credential = await navigator.credentials.create({
    publicKey: publicKeyCredentialCreationOptions
  });

  if (!credential) {
    throw new Error("No se pudo generar la credencial biométrica.");
  }

  return {
    rawId: bufferToBase64Url(credential.rawId),
    id: credential.id,
    type: credential.type
  };
}

/**
 * Valida la identidad del usuario mediante el sensor biométrico del dispositivo.
 */
export async function verificarCredencialBiometrica(credentialIdBase64) {
  if (!window.PublicKeyCredential) {
    throw new Error("Este navegador no soporta autenticación WebAuthn.");
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const allowCredentials = [];

  if (credentialIdBase64) {
    allowCredentials.push({
      id: base64UrlToBuffer(credentialIdBase64),
      type: "public-key",
      transports: ["internal"]
    });
  }

  const publicKeyCredentialRequestOptions = {
    challenge: challenge,
    rpId: window.location.hostname,
    allowCredentials: allowCredentials,
    userVerification: "required",
    timeout: 60000
  };

  const assertion = await navigator.credentials.get({
    publicKey: publicKeyCredentialRequestOptions
  });

  if (!assertion) {
    throw new Error("Validación biométrica no completada.");
  }

  return {
    id: assertion.id,
    rawId: bufferToBase64Url(assertion.rawId)
  };
}
