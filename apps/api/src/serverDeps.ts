// apps/api/src/serverDeps.ts
import { createStore } from "./store/store.js";
import { createCollaboratorsStore } from "./store/collaboratorsStore.js";
import { createMeetingStore } from "./store/meetingStore.js";
import { createAlertScheduleStore } from "./store/alertScheduleStore.js";

export function createDeps() {
  const store = createStore();
  const collabStore = createCollaboratorsStore();
  const meetingStore = createMeetingStore();
  const alertScheduleStore = createAlertScheduleStore();

  return {
    store,
    collabStore,
    meetingStore,
    alertScheduleStore,
    project: process.env.TFS_PROJECT!,
  };
}
