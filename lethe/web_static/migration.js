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

  /** Import the JSON returned by v1's /api/migrate/export endpoint.
   *
   * Vault errors are preflighted before any IndexedDB write, so a wrong old
   * passphrase cannot partially replace the existing browser data.
   */
  function importExport(data, passphrase) {
    if (!window.lethStore) return Promise.reject(new Error('Browser storage is not ready.'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return Promise.reject(new Error('That file is not a legacy migrate/export payload.'));
    }
    var errors = Array.isArray(data.errors) ? data.errors : [];
    if (errors.length) {
      var first = errors[0] || {};
      var detail = first.error ? ': ' + first.error : '';
      return Promise.reject(new Error(
        'Could not decrypt ' + errors.length + ' legacy conversion(s)' + detail +
        '. Nothing was imported; retry with the correct old passphrase.'
      ));
    }
    var entities = Array.isArray(data.entities) ? data.entities : [];
    var tokenTypes = Array.isArray(data.token_types) ? data.token_types : [];
    var jobs = Array.isArray(data.jobs) ? data.jobs : [];
    for (var i = 0; i < jobs.length; i++) {
      if (!jobs[i] || !jobs[i].job_id) {
        return Promise.reject(new Error('Legacy export contains a conversion without a job_id.'));
      }
    }

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
        passphrase: passphrase || ''
      }).then(function () { return { kind: 'jobs', jobId: job.job_id }; }));
    });

    return Promise.all(steps).then(function (results) {
      var addedEntities = 0;
      results.forEach(function (r) {
        if (r && r.kind === 'entities') addedEntities = r.added;
      });
      return {
        entities: entities.length,
        entitiesAdded: addedEntities,
        token_types: tokenTypes.length,
        jobs: jobs.length,
        errors: 0,
        notes: []
      };
    });
  }

  /** Export the legacy server data and import it into this browser.
   *  - oldPassphrase: passphrase used by the legacy vault (blank = none)
   *  - newPassphrase: passphrase the imported mappings are re-encrypted with
   * Returns import counts and the archive path for the UI. */
  function run(oldPassphrase, newPassphrase) {
    if (!window.lethStore) return Promise.reject(new Error('Browser storage is not ready.'));
    return post('/api/migrate/export', { passphrase: oldPassphrase || '' })
      .then(function (data) {
        return importExport(data, newPassphrase || '')
          .then(function (counts) {
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
        var isLegacyExport = backup && backup.errors !== undefined &&
          (Array.isArray(backup.jobs) || Array.isArray(backup.entities));
        var importing = isLegacyExport
          ? importExport(backup, '')
          : window.lethStore.importBackup(backup);
        importing.then(function (r) {
          announce({
            ok: true,
            entities: r.entitiesAdded !== undefined ? r.entitiesAdded : r.added,
            jobs: r.jobs
          });
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

  window.lethMigration = {
    run: run,
    importExport: importExport,
    status: status,
    wireBackupImport: wireBackupImport
  };
})();
