// SPDX-License-Identifier: GPL-3.0-or-later
const fs = require('node:fs');

function validateFirebaseConfig(config, applicationId) {
  if (!/^[a-zA-Z][\w]*(?:\.[a-zA-Z][\w]*)+$/.test(applicationId || '')) {
    throw new Error('Identifiant Android invalide.');
  }
  const client = config?.client?.filter(item => item?.client_info?.android_client_info?.package_name === applicationId);
  if (client?.length !== 1) {
    throw new Error(`Le fichier google-services.json doit contenir exactement un client pour ${applicationId}. Téléchargez la configuration correspondante depuis Firebase ; ne modifiez pas son package à la main.`);
  }
  const projectId = config?.project_info?.project_id;
  const appId = client[0].client_info.mobilesdk_app_id;
  const projectNumber = String(config?.project_info?.project_number || '');
  if (!projectId || !/^\d+$/.test(projectNumber) || !new RegExp(`^1:${projectNumber}:android:[a-f0-9]+$`, 'i').test(appId || '')
      || !client[0].api_key?.some(key => typeof key.current_key === 'string' && key.current_key.length > 0)) {
    throw new Error('Configuration Firebase Android incomplète ou incohérente.');
  }
  return { applicationId, projectId, appId, projectNumber };
}

function loadFirebaseConfig(file, applicationId) {
  return validateFirebaseConfig(JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')), applicationId);
}

module.exports = { loadFirebaseConfig, validateFirebaseConfig };
