/**
 * Stayline – Updater.gs
 * Keeps this Apps Script project in step with the GitHub repo. A push to the branch calls the
 * web app through a GitHub webhook: the files are loaded, a new version is made and the web app
 * moves to it. Nobody has to deploy or press anything.
 *
 * Script properties (Project Settings → Script properties):
 *   GITHUB_TOKEN   fine-grained token with read-only "Contents" access to the repo (required)
 *   GITHUB_REPO    owner/repo (optional, default chowdhuryavy/Hotel_Pms)
 *   GITHUB_BRANCH  branch to follow (optional, default "main")
 *   WEBHOOK_KEY    long random text; the GitHub webhook URL must end with ?key=<this text>
 *
 * One-time setup: script.google.com → Settings → turn on "Google Apps Script API".
 */

const UPDATER_DEFAULT_REPO = 'chowdhuryavy/Hotel_Pms';
// Only the top-level files of the repo are deployed: .gs, .html and appsscript.json.
const UPDATER_FILE_RX = /^[^\/]+\.(gs|html)$|^appsscript\.json$/;

function updaterConfig_() {
  const p = PropertiesService.getScriptProperties();
  const cfg = {
    token: String(p.getProperty('GITHUB_TOKEN') || '').replace(/\s+/g, ''),   // a phone paste can add spaces or line breaks
    repo: p.getProperty('GITHUB_REPO') || UPDATER_DEFAULT_REPO,
    branch: p.getProperty('GITHUB_BRANCH') || 'main'
  };
  if (!cfg.token) throw new Error('Add GITHUB_TOKEN in Script properties first (Project Settings → Script properties).');
  return cfg;
}

/** Calls the GitHub API and returns the response text. */
function gh_(cfg, path, accept) {
  const res = UrlFetchApp.fetch('https://api.github.com/repos/' + cfg.repo + path, {
    headers: { Authorization: 'Bearer ' + cfg.token, Accept: accept || 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    const t = cfg.token || '';
    throw new Error('GitHub returned ' + res.getResponseCode() + ' for ' + path + '. Check GITHUB_TOKEN and GITHUB_REPO. ' +
      'Stored token: ' + t.length + ' characters, starts with "' + t.slice(0, 11) + '".');
  }
  return res.getContentText();
}

/** The newest commit on the branch. */
function headSha_(cfg) {
  return gh_(cfg, '/commits/' + encodeURIComponent(cfg.branch), 'application/vnd.github.sha').trim();
}

/** Reads the top-level files of one commit from GitHub. Returns [{ path, text }]. */
function fetchRepoFiles_(cfg, sha) {
  const tree = JSON.parse(gh_(cfg, '/git/trees/' + sha + '?recursive=1'));
  return tree.tree
    .filter(t => t.type === 'blob' && UPDATER_FILE_RX.test(t.path))
    .map(t => {
      const blob = JSON.parse(gh_(cfg, '/git/blobs/' + t.sha));
      const bytes = Utilities.base64Decode(blob.content.replace(/\n/g, ''));
      return { path: t.path, text: Utilities.newBlob(bytes).getDataAsString('UTF-8') };
    });
}

/** Calls the Apps Script API for this project. */
function scriptApi_(method, path, body) {
  const res = UrlFetchApp.fetch('https://script.googleapis.com/v1/projects/' + ScriptApp.getScriptId() + path, {
    method: method,
    contentType: 'application/json',
    payload: body ? JSON.stringify(body) : undefined,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  const text = res.getContentText();
  if (res.getResponseCode() >= 300) {
    if (/User has not enabled the Apps Script API/i.test(text)) {
      throw new Error('Turn on "Google Apps Script API" at script.google.com/home/usersettings, wait 2–3 minutes and try again.');
    }
    throw new Error('Apps Script API ' + res.getResponseCode() + ': ' + text.slice(0, 300));
  }
  return text ? JSON.parse(text) : {};
}

/** Replaces every file of this project with the repo's files. */
function pushFiles_(files) {
  scriptApi_('put', '/content', {
    files: files.map(f => {
      if (f.path === 'appsscript.json') return { name: 'appsscript', type: 'JSON', source: f.text };
      return { name: f.path.replace(/\.(gs|html)$/, ''), type: /\.html$/.test(f.path) ? 'HTML' : 'SERVER_JS', source: f.text };
    })
  });
}

/** Makes a numbered version of the project. */
function createVersion_(description) {
  return scriptApi_('post', '/versions', { description: description }).versionNumber;
}

/** Every web app deployment of this project (the links staff use). */
function webAppDeployments_() {
  const list = scriptApi_('get', '/deployments?pageSize=50');
  return (list.deployments || []).filter(d =>
    d.deploymentConfig && d.deploymentConfig.versionNumber &&
    (d.entryPoints || []).some(e => e.entryPointType === 'WEB_APP'));
}

/** Moves one web app deployment to a version. */
function pointDeployment_(deployId, versionNumber, description) {
  scriptApi_('put', '/deployments/' + deployId, {
    deploymentConfig: { scriptId: ScriptApp.getScriptId(), versionNumber: versionNumber, manifestFileName: 'appsscript', description: description }
  });
}

/**
 * Loads the newest code of the branch, makes a version and moves the web app to it.
 * Returns a message for the user. Pushes that change only non-app files (README, tools) do nothing.
 */
function updateFromGitHub(auto) {
  const cfg = updaterConfig_();
  const p = PropertiesService.getScriptProperties();
  const sha = headSha_(cfg);
  const files = fetchRepoFiles_(cfg, sha);
  if (!files.some(f => f.path === 'Updater.gs')) throw new Error('Updater.gs is missing in the repo; the update was stopped to keep the updater working.');
  if (!files.some(f => f.path === 'appsscript.json')) throw new Error('appsscript.json is missing in the repo.');

  const hash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    files.map(f => f.path + '\n' + f.text).join('\n\u0000\n'), Utilities.Charset.UTF_8));
  if (hash === p.getProperty('CONTENT_HASH') && !p.getProperty('PENDING_SHA')) {
    p.setProperty('LAST_SHA', sha);
    return 'No app changes in GitHub ' + sha.slice(0, 7) + ' – nothing to update.';
  }

  // Remember that publishing is still due: this run can be cut off after the code has been replaced.
  p.setProperty('PENDING_SHA', sha);
  pushFiles_(files);
  const cfgFile = files.find(f => f.path === 'Config.gs');
  const m = cfgFile && cfgFile.text.match(/const APP_VERSION = '([^']+)'/);
  const desc = 'v' + (m ? m[1] : '?') + ' from GitHub ' + sha.slice(0, 7);
  const version = createVersion_(desc);

  const deps = webAppDeployments_();
  let failed = [];
  deps.forEach(d => {
    try { pointDeployment_(d.deploymentId, version, desc); } catch (e) { failed.push(e.message); }
  });
  p.setProperty('CONTENT_HASH', hash);
  p.setProperty('LAST_SHA', sha);
  p.deleteProperty('PENDING_SHA');

  let msg = (auto ? 'Automatic update: ' : 'Update: ') + desc + ' is now version ' + version + '.';
  if (deps.length) msg += ' ' + (deps.length - failed.length) + ' web app link(s) now run it – reload the app.';
  else msg += ' No web app deployment was found: use Deploy → New deployment → Web app once; later updates move it automatically.';
  if (failed.length) msg += ' Could not move: ' + failed.join(' | ');
  return msg;
}

/**
 * GitHub webhook endpoint. GitHub calls this web app on every push, so an update starts
 * as soon as code is pushed to the branch. No timer is needed.
 * The web app URL must end with ?key=... where the key is the WEBHOOK_KEY script property.
 * Pushes to other branches, and GitHub's test ping, are ignored.
 */
function doPost(e) {
  const out = (msg) => ContentService.createTextOutput(msg).setMimeType(ContentService.MimeType.TEXT);
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty('WEBHOOK_KEY');
  if (!key || !e || !e.parameter || e.parameter.key !== key) return out('Forbidden');
  let body = {};
  try { body = JSON.parse((e.postData && e.postData.contents) || '{}'); } catch (x) { return out('Bad request'); }
  const branch = props.getProperty('GITHUB_BRANCH') || 'main';
  if (!body.ref) return out('Ignored (not a push)');
  if (body.ref !== 'refs/heads/' + branch) return out('Ignored (not the ' + branch + ' branch)');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return out('Busy: an update is already running');
  try {
    return out(updateFromGitHub(true));
  } catch (err) {
    return out('Update failed: ' + err.message);
  } finally {
    lock.releaseLock();
  }
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
