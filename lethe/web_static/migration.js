/*
 * Lethe — pure-browser legacy export/backup import.
 *
 * The v1 server is gone. This module only reads a user-selected JSON file and
 * writes through client-store.js; no network endpoint is involved.
 */
(function () {
  'use strict';

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
        tokenTypes.forEach(function (type) {
          if (merged.indexOf(type) === -1) merged.push(type);
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
      results.forEach(function (result) {
        if (result && result.kind === 'entities') addedEntities = result.added;
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

  function importFile(file, passphrase) {
    if (!file) return Promise.reject(new Error('Choose a backup file first.'));
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(reader.error || new Error('Could not read the file.')); };
      reader.onload = function () {
        var backup;
        try {
          backup = JSON.parse(reader.result);
        } catch (error) {
          reject(new Error('That file is not valid JSON.'));
          return;
        }
        var isLegacyExport = backup && backup.errors !== undefined &&
          (Array.isArray(backup.jobs) || Array.isArray(backup.entities));
        var importing = isLegacyExport
          ? importExport(backup, passphrase || '')
          : window.lethStore.importBackup(backup);
        importing.then(resolve, reject);
      };
      reader.readAsText(file);
    });
  }

  window.lethMigration = {
    importExport: importExport,
    importFile: importFile
  };
})();
