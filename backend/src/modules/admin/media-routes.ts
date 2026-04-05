// @ts-nocheck
export function registerMediaRoutes(app, deps) {
  const {
    collectUsedMediaPaths,
    fs,
    listMediaFiles,
    MEDIA_DIR,
    multer,
    PUBLIC_BASE_URL,
    upload,
  } = deps;

  app.post('/api/admin/uploads', (req, res) => {
    upload.single('file')(req, res, (error) => {
      if (error) {
        const message = error instanceof multer.MulterError ? error.message : error.message || 'Upload failed';
        res.status(400).json({ error: message });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }
      const folder = req.uploadFolder || 'misc';
      const publicPath = `/media/${folder}/${req.file.filename}`;
      res.json({ url: `${PUBLIC_BASE_URL}${publicPath}`, path: publicPath });
    });
  });

  app.post('/api/admin/media/cleanup', async (req, res) => {
    try {
      const dryRun = String(req.query.dryRun || '').toLowerCase() === 'true';
      const used = await collectUsedMediaPaths();
      const files = listMediaFiles(MEDIA_DIR);
      const orphans = files.filter((file) => !used.has(`/media/${file.relative}`));
      if (!dryRun) {
        orphans.forEach((file) => {
          fs.unlinkSync(file.absolute);
        });
      }
      res.json({
        dryRun,
        totalFiles: files.length,
        usedCount: used.size,
        orphanCount: orphans.length,
        removed: dryRun ? [] : orphans.map((file) => `/media/${file.relative}`),
        orphans: orphans.map((file) => `/media/${file.relative}`),
      });
    } catch (error) {
      res.status(500).json({ error: 'Cleanup failed' });
    }
  });
}
