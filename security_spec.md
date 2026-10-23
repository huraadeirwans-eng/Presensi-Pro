# Security Spec: Firestore Security Rules

## 1. Data Invariants
1. Attendance records cannot have unbounded text lengths or corrupted IDs.
2. In attendance records, IDs must follow standard string format (size <= 128).
3. Attendance create & read must be permissible for participant clients to record attendance, while deletes/bulk modifications are restricted.
4. Events and geofence locations can be read by all participants, but creating, updating, and deleting is strictly validated.
5. System configuration cannot contain oversized strings or unauthorized fields.

## 2. The Dirty Dozen Payloads (Rejection Targets)
1. **Oversized Name Payload**: `{ "id": "att_1", "name": "A".repeat(500), "nik": "123", "status": "Hadir" }` -> Reject (name length > 150)
2. **Missing Required Field**: `{ "id": "att_2", "name": "Budi" }` -> Reject (missing status, nik, timestamp)
3. **Invalid ID Character**: Document ID contains path traversal `../../bad` -> Reject
4. **Negative Radius Geofence**: `{ "id": "geo_1", "radiusMeters": -50 }` -> Reject
5. **Ghost Field Injection**: Adding arbitrary fields `{ "superAdminBackdoor": true }` -> Reject
6. **Huge Payload Denial of Wallet**: Injecting 2MB payload into address field -> Reject
7. **Invalid Latitude**: Latitude 999 outside [-90, 90] -> Reject
8. **Invalid Longitude**: Longitude 999 outside [-180, 180] -> Reject
9. **Corrupt Event Date**: 500-char string into date -> Reject
10. **Corrupt Webhook URL**: 5000-char string into system_config -> Reject
11. **Blank Status Attendance**: Status empty string -> Reject
12. **Malformed Timestamp**: Timestamp missing -> Reject

## 3. Threat Model & Audit Matrix
All collection operations are guarded with type constraints, length bounds, and valid ID patterns.
