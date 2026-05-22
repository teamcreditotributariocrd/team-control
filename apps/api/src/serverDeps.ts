// apps/api/src/serverDeps.ts
import { createStore } from "./store/store.js";
import { createCollaboratorsStore } from "./store/collaboratorsStore.js";
import { createMeetingStore } from "./store/meetingStore.js";
import { createAlertScheduleStore } from "./store/alertScheduleStore.js";
import { createIncidentsCacheStore } from "./store/incidentsCacheStore.js";
import { createTfsSupportBugConfigStore } from "./store/tfsSupportBugConfigStore.js";

export function createDeps() {
  const store = createStore();
  const collabStore = createCollaboratorsStore();
  const meetingStore = createMeetingStore();
  const alertScheduleStore = createAlertScheduleStore();
  const incidentsCacheStore = createIncidentsCacheStore();
  const tfsSupportBugConfigStore = createTfsSupportBugConfigStore();

  return {
    store,
    collabStore,
    meetingStore,
    alertScheduleStore,
    incidentsCacheStore,
    tfsSupportBugConfigStore,
    project: process.env.TFS_PROJECT!,
  };
}
