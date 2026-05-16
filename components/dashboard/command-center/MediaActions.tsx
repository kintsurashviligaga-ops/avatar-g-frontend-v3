'use client';

import React, { useState } from 'react';
import { Download, Share2, RefreshCw, Bookmark, Check, Copy, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface MediaActionsProps {
  kind: 'image' | 'video' | 'audio' | 'avatar' | 'text';
  url?: string;
  thumbnailUrl?: string;
  prompt?: string;
  title?: string;
  onRemix?: (prompt: string) => void;
  onSaveCharacter?: (imageUrl: string, prompt: string) => void;
  className?: string;
}

interface ShareModalProps {
  url: string;
  shareUrl: string;
  onClose: () => void;
}

function ShareModal({ url, shareUrl, onClose }: ShareModalProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <motion.div
      className="ma-modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="ma-modal"
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        transition={{ type: 'spring', stiffness: 360, damping: 30 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="ma-modal-header">
          <span>გაზიარება</span>
          <button className="ma-modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="ma-modal-body">
          <div className="ma-share-row">
            <input
              readOnly
              value={shareUrl}
              className="ma-share-input"
              onClick={e => (e.target as HTMLInputElement).select()}
            />
            <button className="ma-copy-btn" onClick={copy}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'კოპირდა' : 'კოპირება'}
            </button>
          </div>
          <p className="ma-share-hint">ნებისმიერი ამ ლინკს ხედავს</p>
        </div>
      </motion.div>

      <style jsx>{`
        .ma-modal-overlay {
          position: fixed; inset: 0; z-index: 1000;
          background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          padding: 16px;
        }
        .ma-modal {
          background: #1a1a2e; border: 1px solid rgba(99,102,241,0.3);
          border-radius: 16px; padding: 20px; width: 100%; max-width: 400px;
        }
        .ma-modal-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 16px; font-weight: 600; color: #e0e0ff;
        }
        .ma-modal-close {
          background: rgba(255,255,255,0.1); border: none; border-radius: 8px;
          padding: 4px; cursor: pointer; color: #aaa; display: flex;
        }
        .ma-modal-close:hover { background: rgba(255,255,255,0.2); color: #fff; }
        .ma-share-row { display: flex; gap: 8px; }
        .ma-share-input {
          flex: 1; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
          border-radius: 8px; padding: 8px 12px; color: #ccc; font-size: 13px;
          outline: none; min-width: 0;
        }
        .ma-copy-btn {
          display: flex; align-items: center; gap: 6px;
          background: #6366f1; border: none; border-radius: 8px;
          padding: 8px 14px; color: #fff; font-size: 13px;
          cursor: pointer; white-space: nowrap; transition: background 0.15s;
        }
        .ma-copy-btn:hover { background: #5558e8; }
        .ma-share-hint {
          font-size: 12px; color: #666; margin-top: 8px;
        }
      `}</style>
    </motion.div>
  );
}

interface SaveCharModalProps {
  imageUrl: string;
  prompt: string;
  onSave: (name: string, description: string) => void;
  onClose: () => void;
}

function SaveCharModal({ imageUrl, prompt, onSave, onClose }: SaveCharModalProps) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState(prompt.slice(0, 200));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave(name.trim(), desc.trim());
    setSaving(false);
    onClose();
  };

  return (
    <motion.div
      className="ma-modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="ma-modal"
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        transition={{ type: 'spring', stiffness: 360, damping: 30 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="ma-modal-header">
          <span>პერსონაჟად შენახვა</span>
          <button className="ma-modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="ma-modal-body">
          {imageUrl && (
            <img src={imageUrl} alt="character preview" className="ma-char-preview" />
          )}
          <label className="ma-label">სახელი *</label>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="მაგ: ნინო, Hero_01..."
            className="ma-char-input"
            maxLength={80}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
          />
          <label className="ma-label">აღწერა</label>
          <textarea
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="პერსონაჟის სტილი, ფერები..."
            className="ma-char-textarea"
            maxLength={500}
            rows={3}
          />
          <button
            className="ma-save-btn"
            onClick={handleSave}
            disabled={!name.trim() || saving}
          >
            {saving ? 'ინახება...' : 'შენახვა'}
          </button>
        </div>
      </motion.div>

      <style jsx>{`
        .ma-modal-overlay {
          position: fixed; inset: 0; z-index: 1000;
          background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          padding: 16px;
        }
        .ma-modal {
          background: #1a1a2e; border: 1px solid rgba(99,102,241,0.3);
          border-radius: 16px; padding: 20px; width: 100%; max-width: 380px;
        }
        .ma-modal-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 16px; font-weight: 600; color: #e0e0ff;
        }
        .ma-modal-close {
          background: rgba(255,255,255,0.1); border: none; border-radius: 8px;
          padding: 4px; cursor: pointer; color: #aaa; display: flex;
        }
        .ma-modal-close:hover { background: rgba(255,255,255,0.2); color: #fff; }
        .ma-char-preview {
          width: 100%; max-height: 200px; object-fit: cover;
          border-radius: 10px; margin-bottom: 14px;
        }
        .ma-label {
          display: block; font-size: 12px; color: #888; margin-bottom: 6px;
          text-transform: uppercase; letter-spacing: 0.04em;
        }
        .ma-char-input, .ma-char-textarea {
          width: 100%; background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.12); border-radius: 8px;
          padding: 10px 12px; color: #e0e0ff; font-size: 14px;
          outline: none; box-sizing: border-box; margin-bottom: 12px;
          font-family: inherit; resize: vertical;
          transition: border-color 0.15s;
        }
        .ma-char-input:focus, .ma-char-textarea:focus {
          border-color: rgba(99,102,241,0.5);
        }
        .ma-save-btn {
          width: 100%; background: #6366f1; border: none; border-radius: 10px;
          padding: 11px; color: #fff; font-size: 14px; font-weight: 600;
          cursor: pointer; transition: background 0.15s;
        }
        .ma-save-btn:hover:not(:disabled) { background: #5558e8; }
        .ma-save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </motion.div>
  );
}

export default function MediaActions({
  kind,
  url,
  thumbnailUrl,
  prompt = '',
  title,
  onRemix,
  onSaveCharacter,
  className = '',
}: MediaActionsProps) {
  const [shareModal, setShareModal] = useState(false);
  const [charModal, setCharModal]   = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [saved, setSaved]           = useState(false);
  const [shareUrl, setShareUrl]     = useState('');

  if (!url) return null;

  const handleDownload = async () => {
    if (!url || downloading) return;
    setDownloading(true);
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const ext  = kind === 'video' ? 'mp4' : kind === 'audio' ? 'mp3' : 'png';
      const name = (title ?? `myavatar-${kind}-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
      const a    = document.createElement('a');
      a.href     = URL.createObjectURL(blob);
      a.download = `${name}.${ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      /* silently fail — user can right-click save */
    }
    setDownloading(false);
  };

  const handleShare = async () => {
    try {
      // First, save to user_creations if not already saved, get share_token
      const resp = await fetch('/api/creations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          service: kind,
          prompt,
          title: title ?? '',
          url,
          thumbnail_url: thumbnailUrl ?? url,
        }),
      });
      if (resp.ok) {
        const { creation } = await resp.json();
        const link = `${window.location.origin}/share/${creation.share_token}`;
        setShareUrl(link);
        // Also make it public
        await fetch(`/api/creations/${creation.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_public: true }),
        });
      } else {
        setShareUrl(url);
      }
    } catch {
      setShareUrl(url);
    }
    setShareModal(true);
  };

  const handleSaveChar = async (name: string, description: string) => {
    if (!url) return;
    const resp = await fetch('/api/character/reference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        image_url: url,
        thumbnail_url: thumbnailUrl ?? url,
        description,
        prompt,
        style_tags: [],
      }),
    });
    if (resp.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  };

  const handleRemix = () => {
    if (onRemix && prompt) onRemix(prompt);
  };

  return (
    <>
      <div className={`ma-bar ${className}`}>
        <motion.button
          className="ma-btn"
          title="ჩამოტვირთვა"
          onClick={handleDownload}
          whileTap={{ scale: 0.9 }}
          disabled={downloading}
        >
          {downloading
            ? <span className="ma-spinner" />
            : <Download size={13} />
          }
          <span className="ma-btn-label">ჩამოტვირთვა</span>
        </motion.button>

        <motion.button
          className="ma-btn"
          title="გაზიარება"
          onClick={handleShare}
          whileTap={{ scale: 0.9 }}
        >
          <Share2 size={13} />
          <span className="ma-btn-label">გაზიარება</span>
        </motion.button>

        {prompt && onRemix && (
          <motion.button
            className="ma-btn"
            title="ხელახლა გენერაცია"
            onClick={handleRemix}
            whileTap={{ scale: 0.9 }}
          >
            <RefreshCw size={13} />
            <span className="ma-btn-label">Remix</span>
          </motion.button>
        )}

        {kind === 'image' && (
          <motion.button
            className={`ma-btn ${saved ? 'ma-btn--saved' : ''}`}
            title="პერსონაჟად შენახვა"
            onClick={() => setCharModal(true)}
            whileTap={{ scale: 0.9 }}
          >
            {saved ? <Check size={13} /> : <Bookmark size={13} />}
            <span className="ma-btn-label">{saved ? 'შენახულია' : 'პერსონაჟი'}</span>
          </motion.button>
        )}
      </div>

      <AnimatePresence>
        {shareModal && (
          <ShareModal
            url={url}
            shareUrl={shareUrl}
            onClose={() => setShareModal(false)}
          />
        )}
        {charModal && (
          <SaveCharModal
            imageUrl={url}
            prompt={prompt}
            onSave={handleSaveChar}
            onClose={() => setCharModal(false)}
          />
        )}
      </AnimatePresence>

      <style jsx>{`
        .ma-bar {
          display: flex; gap: 6px; flex-wrap: wrap;
          margin-top: 8px;
        }
        .ma-btn {
          display: flex; align-items: center; gap: 5px;
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px; padding: 5px 10px;
          color: #aaa; font-size: 12px; cursor: pointer;
          transition: background 0.15s, color 0.15s, border-color 0.15s;
          white-space: nowrap;
        }
        .ma-btn:hover {
          background: rgba(99,102,241,0.15);
          border-color: rgba(99,102,241,0.4);
          color: #c0c0ff;
        }
        .ma-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .ma-btn--saved {
          background: rgba(34,197,94,0.12);
          border-color: rgba(34,197,94,0.3);
          color: #4ade80;
        }
        .ma-btn-label { font-size: 11px; }
        .ma-spinner {
          width: 12px; height: 12px; border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.2);
          border-top-color: #aaa;
          animation: ma-spin 0.7s linear infinite; display: block;
        }
        @keyframes ma-spin { to { transform: rotate(360deg); } }
        @media (max-width: 480px) {
          .ma-btn-label { display: none; }
          .ma-btn { padding: 6px 8px; }
        }
      `}</style>
    </>
  );
}
