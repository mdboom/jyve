import {Kernel} from '@jupyterlab/services';

import {Jyve} from '@deathbeds/jyve/lib';
import {JyveKernel} from '@deathbeds/jyve/lib/kernel';

const {jyve} = (require('../package.json') as any);

export const kernelSpec: Kernel.ISpecModel = jyve.kernelspec;

export async function newKernel(options: JyveKernel.IOptions, id: string): Promise<Jyve.IJyveKernel> {
  const kernel = await import('./kernel');
  return new kernel.P5UnsafeKernel(options, id);
}
