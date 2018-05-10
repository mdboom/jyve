import {JupyterLab, JupyterLabPlugin} from '@jupyterlab/application';

import * as core from '@deathbeds/jyve/lib/index';
import {JyvePanel} from '@deathbeds/jyve/lib/frame';

import '../style/index.css';

const id = '@deathbeds/jyve';

let nextFrameId = 0;

const extension: JupyterLabPlugin<core.IJyve> = {
  id,
  autoStart: true,
  provides: core.IJyve,
  activate: (app: JupyterLab) => {
    const manager = new core.Jyve(app);

    manager.frameRequested.connect((manager, opts) => {
      const panel = new JyvePanel();
      panel.kernel = opts.kernel;
      panel.id = `jyv-frame-${++nextFrameId}`;
      panel.title.label = opts.path
        ? opts.path.split('/').slice(-1)[0]
        : opts.kernel.info.implementation;
      app.shell.addToMainArea(panel, {mode: 'split-right'});
    });

    return manager;
  },
};

export default extension;
