// @ts-nocheck
export function registerAutomationRoutes(app, deps) {
  const {
    clampAutomationIntervalMs,
    executeAutomationJob,
    getAutomationJobConfig,
    isAutomationJobId,
    listAutomationJobConfigs,
    scheduleAutomationJobs,
    serializeAutomationJobConfig,
    updateAutomationJobConfig,
  } = deps;

  app.get('/api/admin/automation/jobs', async (_req, res) => {
    try {
      const configs = await listAutomationJobConfigs();
      res.json(configs.map(serializeAutomationJobConfig));
    } catch (error) {
      console.error('Error fetching automation jobs:', error);
      res.status(500).json({ error: 'Failed to fetch automation jobs' });
    }
  });

  app.patch('/api/admin/automation/jobs/:id', async (req, res) => {
    try {
      const jobIdRaw = req.params.id;
      if (!isAutomationJobId(jobIdRaw)) {
        return res.status(404).json({ error: 'Automation job not found' });
      }

      const hasEnabled = req.body.enabled !== undefined;
      if (hasEnabled && typeof req.body.enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled must be a boolean' });
      }

      const enabled = hasEnabled ? req.body.enabled : undefined;
      const hasIntervalMs = req.body.intervalMs !== undefined;
      const hasIntervalMinutes = req.body.intervalMinutes !== undefined;
      const hasInterval = hasIntervalMs || hasIntervalMinutes;
      const intervalMsInput = hasIntervalMs
        ? Number(req.body.intervalMs)
        : (hasIntervalMinutes ? Number(req.body.intervalMinutes) * 60 * 1000 : undefined);

      if (!hasEnabled && !hasInterval) {
        return res.status(400).json({ error: 'enabled or intervalMs/intervalMinutes is required' });
      }

      let intervalMs;
      if (hasInterval) {
        if (!Number.isFinite(intervalMsInput) || intervalMsInput <= 0) {
          return res.status(400).json({ error: 'intervalMs must be a positive number' });
        }
        intervalMs = clampAutomationIntervalMs(intervalMsInput);
      }

      await updateAutomationJobConfig({
        jobId: jobIdRaw,
        ...(hasEnabled ? { enabled } : {}),
        ...(intervalMs !== undefined ? { intervalMs } : {}),
      });
      await scheduleAutomationJobs();
      const updated = await getAutomationJobConfig(jobIdRaw);
      if (!updated) {
        return res.status(404).json({ error: 'Automation job not found' });
      }
      res.json(serializeAutomationJobConfig(updated));
    } catch (error) {
      console.error('Error updating automation job:', error);
      res.status(500).json({ error: 'Failed to update automation job' });
    }
  });

  app.post('/api/admin/automation/jobs/:id/run', async (req, res) => {
    try {
      const jobIdRaw = req.params.id;
      if (!isAutomationJobId(jobIdRaw)) {
        return res.status(404).json({ error: 'Automation job not found' });
      }

      const result = await executeAutomationJob(jobIdRaw, 'manual');
      const updated = await getAutomationJobConfig(jobIdRaw);
      const payload = updated ? serializeAutomationJobConfig(updated) : null;
      if (result.status === 'ERROR') {
        return res.status(500).json({
          error: result.message,
          result,
          job: payload,
        });
      }
      res.json({
        result,
        job: payload,
      });
    } catch (error) {
      console.error('Error running automation job:', error);
      res.status(500).json({ error: 'Failed to run automation job' });
    }
  });
}
