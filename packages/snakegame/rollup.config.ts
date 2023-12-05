import { getConfig } from '@arkfun/pkg-cli';

export default {
  ...getConfig('src/index.ts', { useTs: true }),
};
