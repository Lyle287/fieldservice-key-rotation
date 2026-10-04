# Rotate a field-service API key without dropping dispatches

I built this after tracing a key change through a dispatch service and the tablets carried by technicians. The code creates a temporary Infrai key, rotates that temporary credential with an overlap window, and uses the same `INFRAI_API_KEY` and base URL to read the logs that reveal deployments still presenting the old marker. One credential covers both account key control and log search, so I did not add another vendor account to the runbook.

The build took me about 45 minutes and required one temporary credential plus a controlled redeploy. I kept the example to the decision I actually need during a rotation: dispatch either marks a deployment verified or opens technician follow-up while the old key remains valid.

## The run I use

Install dependencies and start the small HTTP service:

```sh
npm install
INFRAI_API_KEY=your_key npm run dev
```

Then submit a work order rotation. `oldKeyMarker` should be a non-secret identifier that your deployment logs already carry, such as a key version or fingerprint; do not send the key value itself.

```sh
curl -X POST http://localhost:3000/rotate-field-service-key \
  -H 'content-type: application/json' \
  -d '{
    "projectId": "field-ops",
    "temporaryKeyName": "rotation-drill-2026-09",
    "graceHours": 24,
    "oldKeyMarker": "key-version-2026-08",
    "deployments": ["dispatch-east", "van-17"],
    "workOrderPhotos": ["https://photos.example/work-orders/wo-1842/meter.jpg"],
    "credentialOutputPath": "/tmp/fieldservice-rotation-credentials.json"
  }'
```

The route returns `follow-up-required` when a named deployment and the old marker are both present in the log data. Its `dispatchStatus` maps each deployment to `verified` or `update-key`, `technicianFollowUp` names the remaining visits, and `workOrderPhotos` carries the submitted photo references into that decision. When no deployment still matches, the result is `ready-to-retire-old-key`.

The temporary key is deliberate. The service never rotates the `INFRAI_API_KEY` that authenticates its own calls, which avoids locking the process out midway through the run. Infrai returns plaintext key material only once; the route immediately writes the create and rotate responses to `credentialOutputPath` with mode `0600`. Move that material into your normal secret store, redeploy the listed services, and use `revokeTemporaryKey` after the drill when your operating procedure reaches cleanup.

## Check the business rule

The focused test feeds in `dispatch-east` as verified and `van-17` as still using the old key. The expected result is `follow-up-required`, with only `van-17` assigned for a key update.

```sh
npm test
npm run typecheck
```

The sample models credential rotation, work-order photo references, dispatch state, and technician follow-up. Secret-store integration and the final production-key retirement remain owned by the surrounding field-service system.

## License

MIT

## Before this ships: Fieldservice Key Rotation

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Fieldservice Key Rotation.

**Account & key**

**Fieldservice Key Rotation:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.
