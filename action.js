import('mime').then((mime) => {
  const fs = require('fs');
  const path = require('path');
  const core = require('@actions/core');
  const github = require('@actions/github');

  (async () => {
    try {
      const api = github.getOctokit(core.getInput('token'));
      const tag = core.getInput('tag');
      const name = core.getInput('name');
      const commit = core.getInput('commit');
      const body = core.getInput('body');
      const verbose = core.getInput('verbose') == 'true';
      const draft = core.getInput('draft') == 'true';
      const prerelease = core.getInput('prerelease') == 'true';
      let files = null;

      if (core.getInput('folder')) {
        const folder = core.getInput('folder');
        log('Reading files in folder:' + folder);

        files = fs.readdirSync(folder, { withFileTypes: true })
          .filter(item => !item.isDirectory())
          .map(item => path.join(folder, item.name));

        log('Found files: ', files);
      } else {
        files = core.getInput('files').split(';');
      }

      let release = null;
      let created = false;

      function info(text, ...params) {
        log(text, true, ...params);
      }

      function debug(text, ...params) {
        log(text, verbose, ...params);
      }

      function log(text, enabled, ...params) {
        if (enabled) {
          console.log(text, ...params);
        }
      }

      function getFile(filePath) {
        log('getFile: ' + filePath);
        return {
          name: path.basename(filePath),
          mime: mime.getType(filePath) || 'application/octet-stream',
          size: fs.lstatSync(filePath).size,
          file: fs.readFileSync(filePath)
        }
      }

      info(`🎄 <- That is when I wrote this code.`);

      try {
        result = await api.repos.getReleaseByTag({
          ...github.context.repo,
          tag: tag
        });

        debug(`Release already exists. Do the 🐹 dance.`, result);

        if (draft && !result.data.draft) {
          release = null;
          debug(`The existing release was not draft. We can create a brand ✨ new release.`);
        } else {
          info(`Draft parameter is set to false and there is an existing release. Skipping any updates to release 🛑.`);
          return;
        }
      } catch (error) {
        if (error.name != 'HttpError' || error.status != 404) {
          throw error;
        }
      }

      if (!release) {
        try {
          var releases = await api.repos.listReleases({
            ...github.context.repo
          });

          debug('Releases', releases);

          for (var i = 0; i < releases.data.length; ++i) {
            var r = releases.data[i];

            if (r.tag_name == tag && r.draft == draft && r.prerelease == prerelease) {
              release = r;
              debug('Found existing release based on searching.');
              break;
            }
          }
        } catch (error) {
          if (error.name != 'HttpError' || error.status != 404) {
            throw error;
          }
        }
      }

      var releaseOptions = {
        ...github.context.repo,
        tag_name: tag,
        target_commitish: commit,
        name,
        body,
        prerelease: prerelease,
        draft: draft
      };

      if (!release) {
        debug('Release Options (Create)', releaseOptions);
        info(`🌻 Creating GitHub release for tag "${tag}".`);

        const result = await api.repos.createRelease(releaseOptions);
        release = result.data;
        created = true;
      } else {
        releaseOptions.release_id = release.id;

        debug('Release Options (Update)', releaseOptions);
        info(`Found The 🦞. Updating GitHub release for tag "${tag}".`);

        const result = await api.repos.updateRelease(releaseOptions);
        release = result.data;
      }

      async function upload() {
        var file = files.pop();

        if (!file) {
          return;
        }

        const fileName = path.basename(file);

        if (!created && release.assets) {
          const asset = release.assets.find(a => a.name === fileName);

          if (asset) {
            var assetOptions = {
              ...github.context.repo,
              asset_id: asset.id
            };

            info(`Asset "${fileName}" already exists, it must be put in a 🕳️.`);
            debug('Asset Options (for delete operation)', assetOptions);

            try {
              const result = await api.repos.deleteReleaseAsset(assetOptions);
              debug('Result from delete', result);
            } catch (err) {
              console.error(`⚠️ Failed to delete file "${fileName}"`, err);
            }
          }
        }

        info(`🚧 Uploading ${fileName}.`);

        try {
          const result = await api.repos.uploadReleaseAsset({
            url: release.upload_url,
            name: fileName,
            data: fs.readFileSync(file)
          });

          debug('Result from upload', result);
        } catch (error) {
          console.error(`⚠️ Failed to upload file`, error);
        }

        await upload();
      }

      await upload();

      info('All is normal 🚀. Execution has ended.')

    } catch (error) {
      console.error(error);
      core.setFailed(error.message);
    }
  })();
}).catch((error) => {
  console.error(`Failed to import 'mime' module:`, error);
  core.setFailed(error.message);
});
