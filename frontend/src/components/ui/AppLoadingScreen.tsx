import { useTheme } from '../../context/ThemeContext';

interface AppLoadingScreenProps {
  compact?: boolean;
  label?: string;
}

const AppLoadingScreen = ({ compact = false, label = 'Preparing your workspace' }: AppLoadingScreenProps) => {
  const { settings } = useTheme();

  if (compact) {
    return (
      <div className="page-loading" role="status" aria-live="polite" aria-label={label}>
        <div className="page-loading__header" />
        <div className="page-loading__grid">
          <div className="page-loading__card" />
          <div className="page-loading__card" />
          <div className="page-loading__card" />
        </div>
        <span className="sr-only">{label}</span>
      </div>
    );
  }

  return (
    <div className="app-loading" role="status" aria-live="polite">
      <div className="app-loading__glow" />
      <div className="app-loading__brand">
        <div className="app-loading__mark" aria-hidden="true">
          {settings.logoUrl ? (
            <img src={settings.logoUrl} alt="" />
          ) : (
            settings.schoolName?.charAt(0) || 'S'
          )}
        </div>
        <div>
          <p className="app-loading__eyebrow">SYNC SCHOOL OS</p>
          <h1>{settings.schoolName || 'Your school workspace'}</h1>
        </div>
      </div>
      <div className="app-loading__progress" aria-hidden="true"><span /></div>
      <p className="app-loading__label">{label}</p>
    </div>
  );
};

export default AppLoadingScreen;
