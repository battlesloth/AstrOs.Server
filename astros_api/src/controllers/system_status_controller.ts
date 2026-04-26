import { Router } from 'express';
import { SystemStatus } from '../system_status.js';

export function registerSystemStatusRoutes(router: Router, systemStatus: SystemStatus) {
  router.get('/system/status', (req, res) => {
    res.status(200).json(systemStatus.getState());
  });
}
