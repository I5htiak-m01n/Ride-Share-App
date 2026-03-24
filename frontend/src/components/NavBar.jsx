import NotificationDropdown from './NotificationDropdown';
import UserDropdown from './UserDropdown';

function NavBar({
  brandText = 'RideShare',
  showNotifications = false,
  ratingAvg,
  ratingCount,
  onLogout,
}) {
  return (
    <nav className="dashboard-nav">
      <div className="nav-brand">
        <h2>{brandText}</h2>
      </div>
      <div className="nav-user">
        {showNotifications && <NotificationDropdown />}
        <UserDropdown
          onLogout={onLogout}
          ratingAvg={ratingAvg}
          ratingCount={ratingCount}
        />
      </div>
    </nav>
  );
}

export default NavBar;
