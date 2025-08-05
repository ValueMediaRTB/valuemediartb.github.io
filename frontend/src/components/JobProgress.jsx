import React from 'react';
import { ProgressBar, Alert, Button } from 'react-bootstrap';
import { jobMonitor, isSocketConnected, initSocket } from '../api';

const JobProgress = ({ jobId }) => {
  const [progress, setProgress] = React.useState(0);
  const [message, setMessage] = React.useState('Processing...');
  const [error, setError] = React.useState(null);
  const [show, setShow] = React.useState(false);

  React.useEffect(() => {
    if (!jobId) {
      setShow(false);
      return;
    }

    setShow(true);
    setProgress(0);
    setMessage('Starting job...');
    setError(null);

    const callbacks = {
      onUpdate: (data) => {
        console.log('Job update:', data);
        if (data.progress !== undefined) setProgress(data.progress);
        if (data.message) setMessage(data.message);
      },
      onComplete: () => {
        setProgress(100);
        setMessage('Completed successfully');
        setTimeout(() => setShow(false), 3000);
      },
      onError: (err) => {
        setError(err.error || 'Job failed');
        setMessage('Job failed');
      }
    };

    jobMonitor.startMonitoring(jobId, callbacks);

    return () => {
      jobMonitor.stopMonitoring(jobId);
    };
  }, [jobId]);

  if (!show || !jobId) return null;

 return (
    <div className="job-progress-container">
      <div className="job-progress-message">
        {message}
      </div>
      <div className="job-progress-bar">
        <div
          className="job-progress-bar-inner"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};

export default JobProgress;