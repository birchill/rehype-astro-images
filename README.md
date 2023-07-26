# rehype-astro-images

A [rehype](https://github.com/rehypejs/rehype) plugin to take relative images in
[Astro](https://astro.build/) markdown files and resolve them to their final
optimized image paths.

Prerequisites:

1. You need to use
   [`remarkCollectImages`](https://github.com/withastro/astro/blob/659b2b034cb2f0c3dc72ed957d41a123cf0f43db/packages/markdown/remark/src/remark-collect-images.ts)
   in your markdown parsing. This populates the set of image paths in the
   virtual file data.

   For example:

   ```js
   import { remarkCollectImages } from '@astrojs/markdown-remark';

   const parser = unified()
     .use(remarkParse)
     .use(remarkCollectImages as Plugin<void[], Root>)
     .use(remarkRehype)
     .use(rehypeAstroImages, { rootPath: getProjectRoot() })
     .use(rehypeStringify);
   ```

2. You need a way to get the root of your Astro project on disk.
   No doubt there's a very easy way to do this, but I don't know what it is yet
   (please tell me!).

   The trouble is that when you're in production SSG mode, everything seems to
   run from under `project/dist/chunks` or something.

   I just hack my way there with a function like this:

   ```js
   import { fileURLToPath } from 'node:url';

   export function getProjectRoot() {
     const currentFolder = fileURLToPath(new URL('.', import.meta.url));
     // Detect production mode
     const distIndex = currentFolder.indexOf('dist/');
     if (distIndex !== -1) {
       return currentFolder.slice(0, distIndex);
     }

     // Assuming we are in project/src/utils or some such...
     return fileURLToPath(new URL('../..', import.meta.url));
   }
   ```

3. If you are specifying the rollup option
   [`output.assetFileNames`](https://rollupjs.org/configuration-options/#output-assetfilenames)
   in your Astro/Vite config, you need to pass that Vite config into the plugin.

   You can do that by, for example, separating your vite config into a separate
   file, importing it, and then passing it in.

   ```js
   import viteConfig from '../../vite.config.mjs';

   const parser = unified()
     .use(remarkParse)
     .use(remarkCollectImages as Plugin<void[], Root>)
     .use(remarkRehype)
     .use(rehypeAstroImages, { rootPath: getProjectRoot(), viteConfig })
     .use(rehypeStringify);
   ```
