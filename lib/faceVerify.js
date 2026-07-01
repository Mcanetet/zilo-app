/**
 * Verificación facial demo — en producción integrar API (FaceTec, AWS Rekognition, etc.)
 */
function verifySelfie(dataUrlOrBase64) {
  const raw = String(dataUrlOrBase64);
  if (raw.length < 8000) {
    return { success: false, error: 'La captura es muy pequeña o no es válida. Intenta de nuevo con buena luz.' };
  }

  const hasFaceLikeContent = /image\/(jpeg|jpg|png|webp)/i.test(raw) || raw.length > 15000;
  if (!hasFaceLikeContent) {
    return { success: false, error: 'No se pudo procesar la imagen. Usa formato JPG o PNG.' };
  }

  const score = Math.min(98, 82 + Math.floor(raw.length / 50000));
  return {
    success: true,
    score,
    liveness: 'passed',
    message: 'Identidad verificada correctamente'
  };
}

module.exports = { verifySelfie };
