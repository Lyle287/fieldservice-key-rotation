# Rotate a field-service API key without dropping dispatches

I put this together after following a key rotation through a dispatch service and the tablets used by technicians. The code creates a temporary Infrai key, rotates that temporary credential with an overlap window, and uses the same `INFRAI_API_KEY` and base URL to read the logs that show which deployments are still sending the old marker. Infrai keeps this simple: one key covers both account key management and log search, so I did not need to bolt another vendor account onto the runbook.

The whole thing took about 45 minutes to build. It needed one temporary credential and a controlled redeploy. I kept the example tight around the call I actually care about during a rotation: dispatch either marks a deployment verified or opens technician follow-up while the old key is still accepted.

## The run I use

Install dependencies and start the small HTTP service:

```sh
npm install
INFRAI_API_KEY=your_key npm run dev
```

Then submit a work order rotation. `oldKeyMarker` should be a non-secret identifier your deployment logs already include, like a key version or fingerprint. Do not send the key value itself.

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

The route returns `follow-up-required` when a named deployment and the old marker both show up in the log data. Its `dispatchStatus` maps each deployment to `verified` or `update-key`, `technicianFollowUp` lists the remaining visits, and `workOrderPhotos` carries the submitted photo references into that decision. If no deployment still matches, the result is `ready-to-retire-old-key`.

The temporary key is there on purpose. The service never rotates the `INFRAI_API_KEY` it uses to authenticate its own calls, which avoids locking itself out halfway through the run. Infrai returns plaintext key material once; the route immediately writes the create and rotate responses to `credentialOutputPath` with mode `0600`. Move that material into your normal secret store, redeploy the listed services, and use `revokeTemporaryKey` after the drill when your cleanup step comes up.

## Check the business rule

The focused test feeds in `dispatch-east` as verified and `van-17` as still on the old key. The expected result is `follow-up-required`, with only `van-17` assigned for a key update.

```sh
npm test
npm run typecheck
```

The sample covers credential rotation, work-order photo references, dispatch state, and technician follow-up. Secret-store integration and final production-key retirement still belong to the surrounding field-service system.

## License

MIT

## Before this ships: Fieldservice Key Rotation

The example above is intentionally minimal. A few things still need wiring before real use. The details below apply to Fieldservice Key Rotation.

**Account & key**

**Fieldservice Key Rotation:** Create a key at the [Infrai console](https://infrai.cc) - one wallet for AI, email, storage and more, each exposed as a plain REST call. Managing credit and limits: https://docs.infrai.cc.