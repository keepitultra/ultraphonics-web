/**
 * MemberAvatar — shows a member's Google profile photo if available,
 * falls back to a colored initial bubble. Pass `profiles` from useMemberProfiles().
 *
 * Props:
 *   name      — member first name (must match a key in `profiles`)
 *   profiles  — map from useMemberProfiles(): { [firstName]: { photoURL, displayName } }
 *   size      — pixel size of the circle (default 28)
 *   color     — fallback accent colour for the initial bubble
 *   className — extra classes
 *   title     — tooltip override (defaults to name)
 */
export default function MemberAvatar({ name, profiles = {}, size = 28, color = '#888', className = '', title }) {
  const profile = profiles[name];
  const photoURL = profile?.photoURL;
  const label = title ?? name;

  if (photoURL) {
    return (
      <img
        src={photoURL}
        alt={label}
        title={label}
        className={`rounded-full object-cover ${className}`}
        style={{ width: size, height: size, flexShrink: 0 }}
        referrerPolicy="no-referrer"
      />
    );
  }

  // Fallback: colored initial
  return (
    <span
      className={`rounded-full flex items-center justify-center font-bold ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: `${color}25`,
        color,
        border: `1px solid ${color}50`,
        flexShrink: 0,
      }}
      title={label}
    >
      {name[0]}
    </span>
  );
}
