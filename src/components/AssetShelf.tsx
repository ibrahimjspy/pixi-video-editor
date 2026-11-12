'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Asset } from '@/types/editor';
import { useEditorStore } from '@/store/editorStore';
import { Icon } from '@/components/icons';

/**
 * Reads browser-native dimensions and duration before an asset enters the
 * project. The caller owns the object URL and must revoke it if this fails.
 */
const readAssetMetadata = async (file: File, url: string) => {
  if (file.type.startsWith('image/')) {
    const image = new Image();
    image.src = url;
    await image.decode();

    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      durationMs: undefined,
    };
  }

  if (file.type.startsWith('video/')) {
    const video = document.createElement('video');
    video.src = url;

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Video metadata could not be read.'));
    });

    return {
      width: video.videoWidth,
      height: video.videoHeight,
      durationMs: Number.isFinite(video.duration)
        ? Math.round(video.duration * 1000)
        : undefined,
    };
  }

  return {};
};

const isSupportedFile = (file: File) =>
  file.type.startsWith('image/') || file.type.startsWith('video/');

const hasFiles = (event: DragEvent<HTMLElement>) =>
  Array.from(event.dataTransfer.types).includes('Files');

const describeAsset = (asset: Asset) => {
  const size = asset.width && asset.height ? `${asset.width}×${asset.height}` : null;
  const duration = asset.durationMs ? `${(asset.durationMs / 1000).toFixed(1)}s` : null;

  return [asset.kind, duration, size].filter(Boolean).join(' · ');
};

/**
 * Imports local images and videos (file picker, drag and drop, or paste) and
 * offers quick ways to add text layers.
 */
const AssetShelf = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const assets = useEditorStore((state) => state.project.assets);
  const selectedAssetId = useEditorStore((state) => state.project.selection.assetId);
  const importAsset = useEditorStore((state) => state.importAsset);
  const registerAssetBlob = useEditorStore((state) => state.registerAssetBlob);
  const selectAsset = useEditorStore((state) => state.selectAsset);
  const executeCommand = useEditorStore((state) => state.executeCommand);

  /** Imports each supported file as an asset and places it on the canvas. */
  const importFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) {
        return;
      }

      setIsLoading(true);
      setImportError(null);

      try {
        for (const file of files) {
          if (!isSupportedFile(file)) {
            setImportError(`${file.name} is not a supported image or video.`);
            continue;
          }

          const url = URL.createObjectURL(file);

          try {
            const metadata = await readAssetMetadata(file, url);
            const asset: Asset = {
              id: uuidv4(),
              kind: file.type.startsWith('video/') ? 'video' : 'image',
              name: file.name,
              url,
              mimeType: file.type,
              importedAt: new Date().toISOString(),
              ...metadata,
            };

            // Keep the original file so autosave can store it with the project.
            registerAssetBlob(asset.id, file);
            importAsset(asset, true);
          } catch {
            URL.revokeObjectURL(url);
            setImportError(`${file.name} could not be read and was skipped.`);
          }
        }
      } finally {
        setIsLoading(false);
      }
    },
    [importAsset, registerAssetBlob],
  );

  // Pasting an image or video anywhere outside a text field imports it.
  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const target = event.target;

      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }

      const files = Array.from(event.clipboardData?.files ?? []).filter(isSupportedFile);

      if (files.length > 0) {
        event.preventDefault();
        void importFiles(files);
      }
    };

    window.addEventListener('paste', handlePaste);

    return () => window.removeEventListener('paste', handlePaste);
  }, [importFiles]);

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const files = Array.from(input.files ?? []);

    try {
      await importFiles(files);
    } finally {
      input.value = '';
    }
  };

  const handleDragEnter = (event: DragEvent<HTMLElement>) => {
    if (!hasFiles(event)) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDropTarget(true);
  };

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (!hasFiles(event)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!hasFiles(event)) {
      return;
    }

    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);

    if (dragDepthRef.current === 0) {
      setIsDropTarget(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    if (!hasFiles(event)) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDropTarget(false);
    void importFiles(Array.from(event.dataTransfer.files));
  };

  return (
    <aside
      className={`signal-panel signal-panel--asset ${isDropTarget ? 'is-drop-target' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="signal-panel__header">
        <div>
          <p className="signal-kicker">Assets</p>
          <h2>Media</h2>
        </div>
        <button
          type="button"
          className="signal-button signal-button--secondary"
          disabled={isLoading}
          onClick={() => fileInputRef.current?.click()}
        >
          {isLoading ? 'Importing…' : 'Upload'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          aria-label="Upload images or videos"
          onChange={handleUpload}
        />
      </div>

      {importError && (
        <p className="signal-request-error" role="alert">
          {importError}
        </p>
      )}

      <section className="signal-card">
        <p className="signal-card__eyebrow">Quick add</p>
        <div className="signal-action-grid">
          <button
            type="button"
            className="signal-tile"
            onClick={() => executeCommand({ type: 'create_text', text: 'Your headline' }, 'user')}
          >
            <Icon name="text" />
            Add text
          </button>
          <button
            type="button"
            className="signal-tile"
            onClick={() =>
              executeCommand({ type: 'add_caption_block', text: 'Your caption' }, 'user')
            }
          >
            <Icon name="plus" />
            Add caption
          </button>
        </div>
      </section>

      <section className="signal-card signal-card--list">
        <div className="signal-section-title">
          <span>Imported</span>
          <span>{assets.length}</span>
        </div>
        <div className="signal-asset-list">
          {assets.length === 0 ? (
            <p className="signal-empty">
              Upload, drop, or paste an image or video. It is placed on the canvas as a new layer.
            </p>
          ) : (
            assets.map((asset) => (
              <button
                key={asset.id}
                type="button"
                className={`signal-asset-item ${selectedAssetId === asset.id ? 'is-active' : ''}`}
                aria-pressed={selectedAssetId === asset.id}
                onClick={() => selectAsset(asset.id)}
              >
                {asset.kind === 'image' ? (
                  <span
                    className="signal-asset-thumb"
                    style={{ backgroundImage: `url(${asset.url})` }}
                  />
                ) : (
                  <span className="signal-asset-thumb signal-asset-thumb--icon">
                    <Icon name="video" size={20} />
                  </span>
                )}
                <span className="signal-asset-copy">
                  <strong>{asset.name}</strong>
                  <small>{describeAsset(asset)}</small>
                </span>
              </button>
            ))
          )}
        </div>
      </section>

      {isDropTarget && (
        <div className="signal-drop-overlay" aria-hidden="true">
          Drop to import
        </div>
      )}
    </aside>
  );
};

export default AssetShelf;
