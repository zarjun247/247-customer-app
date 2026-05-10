Incident Command Center (backend)

- Added incident service: server/services/incidentService.ts
  - createIncident({title,description,severity,related}) writes an audit log action 'incident.created'
  - transitionIncident(incidentAuditId,newStatus,note) writes 'incident.transitioned'
- Extended command center router with operational endpoints:
  - providerHealthBoard, deadLetterBoard, retryQueueBoard, incidentTimelineBoard
  - createIncident, transitionIncident, listIncidents
- Incidents are stored as audit rows (action = 'incident.*').
- Next steps: add dedicated incidents table and event bus migration in a follow-up non-destructive migration
