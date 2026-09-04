/**
 * MemberAvatar — a member's coloured initial bubble.
 *
 * The admin always shows a member's chosen colour + initial here rather than
 * their profile picture, so avatars stay consistent and recognisable across
 * every admin surface (setlists, calendar, shows, heads-up). `photoUrl` and
 * `profiles` are accepted for call-site compatibility but intentionally unused.
 *
 * Props:
 *   name      — member first name
 *   size      — pixel size of the circle (default 28)
 *   color     — accent colour for the initial bubble
 *   className — extra classes
 *   title     — tooltip override (defaults to name)
 */
export default function MemberAvatar({ name, size = 28, color = '#888', className = '', title }) {
  const label = title ?? name;

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
