// @ts-nocheck
export function registerRedirectRuleRoutes(app, deps) {
  const {
    createRedirectRuleRow,
    deleteRedirectRuleRow,
    listRedirectRuleRows,
    serializeRedirectRule,
    updateRedirectRuleRow,
  } = deps;

  app.get('/api/admin/redirect-rules', async (_req, res) => {
    try {
      const rows = await listRedirectRuleRows();
      return res.json(rows.map(serializeRedirectRule));
    } catch (error) {
      console.error('Error fetching redirect rules:', error);
      return res.status(500).json({ error: 'Failed to fetch redirect rules' });
    }
  });

  app.post('/api/admin/redirect-rules', async (req, res) => {
    try {
      const row = await createRedirectRuleRow(req.body || {});
      if (!row) {
        return res.status(500).json({ error: 'Failed to create redirect rule' });
      }
      return res.status(201).json(serializeRedirectRule(row));
    } catch (error) {
      if (error instanceof Error) {
        return res.status(400).json({ error: error.message });
      }
      console.error('Error creating redirect rule:', error);
      return res.status(500).json({ error: 'Failed to create redirect rule' });
    }
  });

  app.patch('/api/admin/redirect-rules/:id', async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!id) {
        return res.status(400).json({ error: 'Redirect rule id is required' });
      }

      const row = await updateRedirectRuleRow(id, req.body || {});
      if (!row) {
        return res.status(404).json({ error: 'Redirect rule not found' });
      }
      return res.json(serializeRedirectRule(row));
    } catch (error) {
      if (error instanceof Error) {
        return res.status(400).json({ error: error.message });
      }
      console.error('Error updating redirect rule:', error);
      return res.status(500).json({ error: 'Failed to update redirect rule' });
    }
  });

  app.delete('/api/admin/redirect-rules/:id', async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!id) {
        return res.status(400).json({ error: 'Redirect rule id is required' });
      }

      const deleted = await deleteRedirectRuleRow(id);
      if (!deleted) {
        return res.status(404).json({ error: 'Redirect rule not found' });
      }
      return res.status(204).send();
    } catch (error) {
      console.error('Error deleting redirect rule:', error);
      return res.status(500).json({ error: 'Failed to delete redirect rule' });
    }
  });
}
