/**
 * Stayline – Updater.gs
 * Pulls the latest Stayline files from the private GitHub repo and replaces this project's code.
 * It only updates when the repo's APP_VERSION is higher than the installed one, so a push with
 * no version bump does nothing.
 *
 * Script properties (Project Settings → Script properties):
 *   GITHUB_TOKEN   fine-grained token with read-only "Contents" access to the repo (required)
 *   GITHUB_REPO    owner/repo, for example chowdhuryavy/Stayline (required)
 *   GITHUB_BRANCH  branch to follow, default "main"
 *   DEPLOYMENT_ID  optional. When set, the web app deployment is pointed at the new version automatically.
 *
 * One-time setup: script.google.com → Settings → turn on "Google Apps Script API".
 * Google asks you to approve the updated permissions the first time you run an update.
 */

// Only the top-level files of the repo are deployed: .gs, .html and appsscript.json.
const UPDATER_FILE_RX = /^[^\/]+\.(gs|html)$|^appsscript\.json$/;

function updaterConfig_() {
  const p = PropertiesService.getScriptProperties();
  const cfg = {
    token: p.getProperty('GITHUB_TOKEN'),
    repo: p.getProperty('GITHUB_REPO'),
    branch: p.getProperty('GITHUB_BRANCH') || 'main',
    deployId: p.getProperty('DEPLOYMENT_ID') || ''
  };
  if (!cfg.token || !cfg.repo) throw new Error('Set GITHUB_TOKEN and GITHUB_REPO in Script properties first.');
  return cfg;
}

function githubJson_(cfg, path) {
  const res = UrlFetchApp.fetch('https://api.github.com/repos/' + cfg.repo + path, {
    headers: { Authorization: 'Bearer ' + cfg.token, Accept: 'application/vnd.github+json' },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    throw new Error('GitHub returned ' + res.getResponseCode() + ' for ' + path + '. Check GITHUB_TOKEN and GITHUB_REPO.');
  }
  return JSON.parse(res.getContentText());
}

/** Reads the top-level files of the branch from GitHub. Returns [{ path, text }]. */
function fetchRepoFiles_(cfg) {
  const tree = githubJson_(cfg, '/git/trees/' + encodeURIComponent(cfg.branch) + '?recursive=1');
  return tree.tree
    .filter(t => t.type === 'blob' && UPDATER_FILE_RX.test(t.path))
    .map(t => {
      const blob = githubJson_(cfg, '/git/blobs/' + t.sha);
      const bytes = Utilities.base64Decode(blob.content.replace(/\n/g, ''));
      return { path: t.path, text: Utilities.newBlob(bytes).getDataAsString('UTF-8') };
    });
}

/** Compares dotted versions: returns >0 if a is newer than b, <0 if older, 0 if equal. */
function compareVersions_(a, b) {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d;
  }
  return 0;
}

/** Replaces every file of this project with the repo's files (Apps Script API projects.updateContent). */
function pushFiles_(files) {
  const body = {
    files: files.map(f => {
      if (f.path === 'appsscript.json') return { name: 'appsscript', type: 'JSON', source: f.text };
      return {
        name: f.path.replace(/\.(gs|html)$/, ''),
        type: /\.html$/.test(f.path) ? 'HTML' : 'SERVER_JS',
        source: f.text
      };
    })
  };
  const res = UrlFetchApp.fetch('https://script.googleapis.com/v1/projects/' + ScriptApp.getScriptId() + '/content', {
    method: 'put',
    contentType: 'application/json',
    payload: JSON.stringify(body),
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    throw new Error('Apps Script update failed (' + res.getResponseCode() + '): ' + res.getContentText().slice(0, 300));
  }
}

/** Creates a numbered version of the project (Apps Script API projects.versions.create). */
function createVersion_(description) {
  const res = UrlFetchApp.fetch('https://script.googleapis.com/v1/projects/' + ScriptApp.getScriptId() + '/versions', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ description: description }),
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    throw new Error('Could not create a version (' + res.getResponseCode() + '): ' + res.getContentText().slice(0, 300));
  }
  return JSON.parse(res.getContentText()).versionNumber;
}

/** Points the web app deployment at a version (Apps Script API projects.deployments.update). */
function pointDeployment_(deployId, versionNumber, description) {
  const scriptId = ScriptApp.getScriptId();
  const res = UrlFetchApp.fetch('https://script.googleapis.com/v1/projects/' + scriptId + '/deployments/' + deployId, {
    method: 'put',
    contentType: 'application/json',
    payload: JSON.stringify({
      deploymentConfig: { scriptId: scriptId, versionNumber: versionNumber, manifestFileName: 'appsscript', description: description }
    }),
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    throw new Error('Could not update the deployment (' + res.getResponseCode() + '): ' + res.getContentText().slice(0, 300));
  }
}

/**
 * Main update. Returns a message for the user.
 * Installed version is APP_VERSION in Config.gs; the repo's version is read from the same line in the repo.
 */
function updateFromGitHub() {
  const cfg = updaterConfig_();
  const files = fetchRepoFiles_(cfg);
  const configFile = files.find(f => f.path === 'Config.gs');
  const m = configFile && configFile.text.match(/const APP_VERSION = '([^']+)'/);
  if (!m) throw new Error('Config.gs in the repo has no APP_VERSION line.');
  const remote = m[1];
  if (compareVersions_(remote, APP_VERSION) <= 0) {
    return 'Already up to date (version ' + APP_VERSION + ' is the latest in the repo).';
  }
  if (!files.some(f => f.path === 'Updater.gs')) throw new Error('Updater.gs is missing from the repo; the update was stopped to keep it working.');

  pushFiles_(files);
  const description = 'Stayline ' + remote;
  const version = createVersion_(description);
  if (cfg.deployId) {
    pointDeployment_(cfg.deployId, version, description);
    return 'Updated to ' + remote + '. The web app now runs version ' + version + '. Reload the app.';
  }
  return 'Updated to ' + remote + '. Version ' + version + ' is ready: in Apps Script go to Deploy → Manage deployments and choose it.';
}

/**
 * Web app endpoint called by the GitHub Action after each push to main.
 * The request must carry the UPDATE_KEY script property, otherwise nothing happens.
 */
function updateEndpoint_(key) {
  const expected = PropertiesService.getScriptProperties().getProperty('UPDATE_KEY');
  const text = (msg) => ContentService.createTextOutput(msg).setMimeType(ContentService.MimeType.TEXT);
  if (!expected || key !== expected) return text('Forbidden');
  try {
    return text(updateFromGitHub());
  } catch (e) {
    return text('Update failed: ' + e.message);
  }
}
