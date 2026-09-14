/*
 * Lethe — one-time migration of a legacy server-side DATA_DIR, plus backup
 * import UI glue. Runs entirely against the local /api/migrate/* endpoints
 * (loopback only) and writes the imported data into window.lethStore.
 */
(function () {
  'use strict';

  function post(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (resp) {
      return resp.json().then(function (data) {
        if (!resp.ok) throw new Error(data.error || ('Request failed (' + resp.status + ').'));
        return data;
      });
    });
  }

  /** Export the legacy server data and import it into this browser.
   *  - oldPassphrase: passphrase used by the legacy vault (blank = none)
   *  - newPassphrase: passphrase the imported mappings are re-encrypted with
   * Returns {entities, token_types, jobs, errors, preparedCount} for the UI. */
  function run(oldPassphrase, newPassphrase) {
    if (!window.lethStore) return Promise.reject(new Error('Browser storage is not ready.'));
    return post('/api/migrate/export', { passphrase: oldPassphrase || '' })
      .then(function (data) {
        var entities = data.entities || [];
        var tokenTypes = data.token_types || [];
        var jobs = data.jobs || [];
        var errors = data.errors || [];
        var steps = [];

        if (entities.length) {
          steps.push(window.lethStore.mergeEntities(entities).then(function (added) {
            return { kind: 'entities', added: added };
          }));
        }
        if (tokenTypes.length) {
          steps.push(window.lethStore.getTokenTypes().then(function (existing) {
            var merged = existing.slice();
            tokenTypes.forEach(function (t) {
              if (merged.indexOf(t) === -1) merged.push(t);
            });
            return window.lethStore.saveTokenTypes(merged).then(function () {
              return { kind: 'token_types', added: merged.length };
            });
          }));
        }
        jobs.forEach(function (job) {
          steps.push(window.lethStore.saveJob({
            jobId: job.job_id,
            createdAt: job.created || new Date().toISOString(),
            sourceFiles: job.source_files || [],
            replacements: job.replacements || 0,
            mapping: job.mapping || {},
            passphrase: newPassphrase || (oldPassphrase || '')
          }).then(function () { return { kind: 'jobs', jobId: job.job_id }; }));
        });

        return Promise.all(steps).then(function (results) {
          var counts = { entities: entities.length, token_types: tokenTypes.length,
                         jobs: jobs.length, errors: errors.length };
          var addedEntities = 0;
          results.forEach(function (r) {
            if (r && r.kind === 'entities') addedEntities = r.added;
          });
          counts.entitiesAdded = addedEntities;
          counts.notes = errors.map(function (e) {
            return 'Job ' + e.job_id + ': ' + e.error;
          });
          return post('/api/migrate/finalize', {}).then(function (fin) {
            counts.archivedTo = fin.archived_to || null;
            return counts;
          });
        });
      });
  }

  function status() {
    return fetch('/api/migrate/status').then(function (resp) { return resp.json(); });
  }

  /** Wire a file <input> so choosing a JSON backup imports it into the store. */
  function wireBackupImport(fileInputId) {
    var input = document.getElementById(fileInputId);
    if (!input || input.dataset.lethWired === '1') return;
    input.dataset.lethWired = '1';
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      input.value = '';
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var backup;
        try {
          backup = JSON.parse(reader.result);
        } catch (e) {
          announce({ ok: false, error: 'That file is not valid JSON.' });
          return;
        }
        window.lethStore.importBackup(backup).then(function (r) {
          announce({ ok: true, entities: r.added, jobs: r.jobs });
        }).catch(function (e) {
          announce({ ok: false, error: e.message || String(e) });
        });
      };
      reader.readAsText(file);
    });
  }

  function announce(result) {
    try {
      if (typeof window.emitEvent === 'function') {
        window.emitEvent('leth-backup-imported', result);
      }
    } catch (e) { /* ignore */ }
  }

  window.lethMigration = { run: run, status: status, wireBackupImport: wireBackupImport };
})();
