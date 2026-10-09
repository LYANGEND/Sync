import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/** Shown when no term is active. The active term is set only in Settings > Academic. */
const NoActiveTermNotice = () => {
  const { user } = useAuth();
  return (
    <div className="rounded-[20px] border border-gray-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800" role="status">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">No active term</h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">This page works with the active term. An administrator sets it in Settings.</p>
      {user?.role === 'SUPER_ADMIN' && (
        <Link to="/settings?tab=academic" className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
          Open academic settings
        </Link>
      )}
    </div>
  );
};

export default NoActiveTermNotice;
