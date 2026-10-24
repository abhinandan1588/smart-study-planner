import PagePlaceholder from '../../../components/common/PagePlaceholder';

export default function ProfileSettingsPage() {
  return (
    <PagePlaceholder
      title="Profile & Settings"
      description="Profile, availability, study targets, focus durations, notifications and password."
      icon="settings"
      endpoints={[
        'GET /student/profile',
        'PATCH /student/profile',
        'POST /student/profile/password',
      ]}
    />
  );
}
