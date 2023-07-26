// @ts-check
import { getImage } from 'astro:assets';
import { imageMetadata } from 'astro/assets/utils';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';
import { visit } from 'unist-util-visit';

/**
 * @typedef {import('hast').Root} Root
 * @typedef {import('hast').Element} Element
 * @typedef {import('hast').Properties} Properties
 * @typedef {import('vite').UserConfig} ViteConfig
 */

/**
 * @typedef {object} Options
 * @property {string} rootPath
 * @property {URL | string=} rootUrl
 * @property {ViteConfig=} viteConfig
 */

/**
 * @type {import('unified').Plugin<[Options], Root>}
 */
export function rehypeAstroImages(options) {
  return async function (tree, file) {
    if (
      !file.path ||
      !(file.data.imagePaths instanceof Set) ||
      !file.data.imagePaths?.size
    ) {
      return;
    }

    // Collect the images we need to resolve.

    /**
     * @typedef {Omit<Element, 'properties'> & { properties: { src: string } }} ElementWithSrcProperty
     */
    /** @type ElementWithSrcProperty[] */
    const imageNodes = [];
    /** @type Map<string, string> */
    const imagesToResolve = new Map();
    visit(tree, (node) => {
      if (
        node.type !== 'element' ||
        node.tagName !== 'img' ||
        typeof node.properties?.src !== 'string' ||
        !node.properties?.src ||
        !(
          /** @type {Set<string>} */ (file.data.imagePaths).has(
            node.properties.src
          )
        )
      ) {
        return;
      }

      const nodeWithSrcProperty = /** @type ElementWithSrcProperty */ (node);

      if (imagesToResolve.has(nodeWithSrcProperty.properties.src)) {
        imageNodes.push(nodeWithSrcProperty);
        return;
      }

      let absolutePath;

      // Special handling for the ~/assets alias
      if (nodeWithSrcProperty.properties.src.startsWith('~/assets/')) {
        absolutePath = path.resolve(
          options.rootPath,
          'src',
          'assets',
          node.properties.src.substring('~/assets/'.length)
        );
      } else {
        absolutePath = path.resolve(
          path.dirname(file.path),
          nodeWithSrcProperty.properties.src
        );
      }

      if (!fs.existsSync(absolutePath)) {
        return;
      }

      imageNodes.push(nodeWithSrcProperty);
      imagesToResolve.set(nodeWithSrcProperty.properties.src, absolutePath);
    });

    // Resolve all the images
    /** @type Promise<[string, string]>[] */
    const imagePromises = [];
    for (const [relativePath, absolutePath] of imagesToResolve.entries()) {
      imagePromises.push(
        imageMetadata(url.pathToFileURL(absolutePath))
          .then((meta) => {
            if (!meta) {
              throw new Error(
                `Failed to get metadata for image ${relativePath}`
              );
            }
            const assetPath = getImageAssetFileName(
              absolutePath,
              options.viteConfig
            );
            return getImage({ src: { ...meta, src: assetPath } });
          })
          .then((image) => [relativePath, image.src])
      );
    }

    // Process the result
    /** @type {Map<string, string>} */
    const resolvedImages = new Map();
    for (const result of await Promise.allSettled(imagePromises)) {
      if (result.status === 'fulfilled') {
        resolvedImages.set(...result.value);
      } else {
        console.warn('Failed to resolve image', result.reason);
      }
    }

    for (const node of imageNodes) {
      const resolvedSrc = resolvedImages.get(node.properties.src);
      if (resolvedSrc) {
        if (options.rootUrl) {
          node.properties.src = new URL(
            resolvedSrc,
            options.rootUrl
          ).toString();
        } else {
          node.properties.src = absolutize(resolvedSrc);
        }
      }
    }
  };
}

/**
 * @param {string} absolutePath
 * @param {ViteConfig=} viteConfig
 */
function getImageAssetFileName(absolutePath, viteConfig) {
  const source = getImageSource(absolutePath);
  const sourceHash = getImageHash(source);

  if (Array.isArray(viteConfig?.build?.rollupOptions?.output)) {
    throw new Error("We don't know how to handle multiple output options 😬");
  }

  const assetFileNames =
    viteConfig?.build?.rollupOptions?.output?.assetFileNames ||
    'assets/[name]-[hash][extname]';

  return generateAssetFileName(
    path.basename(absolutePath),
    source,
    sourceHash,
    assetFileNames
  );
}

/**
 * @param {string} imagePath
 */
function getImageSource(imagePath) {
  const data = fs.readFileSync(imagePath);
  return new Uint8Array(data);
}

/**
 * @param {Uint8Array} imageSource
 */
function getImageHash(imageSource) {
  return createHash('sha256')
    .update(imageSource)
    .digest('hex')
    .slice(0, Math.max(0, 8));
}

/**
 * @typedef {object} AssetInfo
 * @property {string=} fileName
 * @property {string} name
 * @property {boolean=} needsCodeReference
 * @property {string | Uint8Array} source
 * @property {'asset'} type
 *
 * @param {string} name
 * @param {Uint8Array} source
 * @param {string} sourceHash
 * @param {string | ((assetInfo: AssetInfo) => string)} assetFileNames
 */
function generateAssetFileName(name, source, sourceHash, assetFileNames) {
  const defaultHashSize = 8;

  return renderNamePattern(
    typeof assetFileNames === 'function'
      ? assetFileNames({ name, source, type: 'asset' })
      : assetFileNames,
    {
      ext: () => path.extname(name).slice(1),
      extname: () => path.extname(name),
      hash: (size) => sourceHash.slice(0, Math.max(0, size || defaultHashSize)),
      name: () =>
        name.slice(0, Math.max(0, name.length - path.extname(name).length)),
    }
  );
}

/**
 * @param {string} pattern
 * @param {{ [name: string]: (size?: number) => string }} replacements
 */
function renderNamePattern(pattern, replacements) {
  return pattern.replace(/\[(\w+)(:\d+)?]/g, (_match, type, size) =>
    replacements[type](size && Number.parseInt(size.slice(1)))
  );
}

/**
 * @param {string} path
 */
function absolutize(path) {
  return path.startsWith('/') ? `/${path}` : path;
}
