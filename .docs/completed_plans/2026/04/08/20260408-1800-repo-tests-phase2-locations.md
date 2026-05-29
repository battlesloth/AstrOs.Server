# Repository Unit Tests — Phase 2: LocationsRepository

## Context

LocationsRepository is the most complex repository — multi-table joins, a transactional `updateLocation()` that orchestrates UART/I2C/GPIO module operations, fingerprint tracking, and controller-location relationships. It needs thorough testing.

## Key methods to test

1. **`getLocations()`** — joins locations → controller_locations → controllers. Returns array with controller data (or defaults if no mapping).
2. **`getLocationByController(id)`** — same join, filtered by controller ID.
3. **`getLocationIdByControllerByMac(mac)`** — lookup location by controller MAC address.
4. **`getLocationNameByMac(mac)`** — lookup location name by controller MAC.
5. **`loadLocations()`** — calls getLocations() + loadLocationConfiguration() for each.
6. **`loadLocationConfiguration(location)`** — loads UART, I2C, GPIO modules onto a location.
7. **`updateLocation(location)`** — transaction: marks fingerprint stale → sets controller → cleans/upserts UART, I2C, GPIO modules.
8. **`setLocationController(trx, locationId, controllerId)`** — replaces controller mapping.
9. **`updateLocationFingerprint(locationId, fingerprint)`** — updates fingerprint.

## Tasks

- [x] Test getLocations and getLocationByController (join queries with seed data)
- [x] Test MAC address lookups (getLocationIdByControllerByMac, getLocationNameByMac)
- [x] Test loadLocations / loadLocationConfiguration (full module loading)
- [x] Test updateLocation transaction (fingerprint, controller swap, module upsert/cleanup)
- [x] Test updateLocationFingerprint
- [x] Run full suite, verify all pass

## Seed data to account for

Migration seeds: 3 locations (Body, Core, Dome), 1 master controller, 1 controller_locations mapping (body→master), 10 GPIO channels per location. Tests should work relative to seed data.

## File to create

- `astros_api/src/dal/repositories/locations_repository.test.ts`

## Verification

```bash
cd astros_api && npx vitest run
```
