// services/jobManager.js
const redis = require('../config/redis');

class JobManager {
  constructor() {
    this.JOB_CONFIG = {
      MAX_CONCURRENT_JOBS: 1,
      JOB_TIMEOUT: 12 * 60 * 60 * 1000, // 12 hours
      RESULT_TTL: 24 * 60 * 60, // 24 hours
      CLEANUP_INTERVAL: 24 * 60 * 60 * 1000, // 24 hours
      KEY_PREFIX: 'job:',
      USER_JOBS_PREFIX: 'user_jobs:',
      ACTIVE_JOBS_SET: 'active_jobs'
    };
    
    // Start cleanup interval
    this.startCleanupInterval();
  }

  /**
   * Generate unique job ID across multiple server instances
   */
  generateJobId() {
    const serverId = process.pid;
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return `job_${timestamp}_${serverId}_${random}`;
  }

  /**
   * Create a new job in Redis atomically
   */
  async createJob(userId, jobType, params = {}) {
    const jobId = this.generateJobId();
    const jobData = {
      jobId,
      userId: userId.toString(),
      jobType,
      status: 'started',
      progress: 0,
      message: 'Job queued for processing',
      params: JSON.stringify(params),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    try {
      await redis.connect();
      
      // Store job data
      await redis.client.hSet(`${this.JOB_CONFIG.KEY_PREFIX}${jobId}`, jobData);
      
      // Add to active jobs set
      await redis.client.sAdd(this.JOB_CONFIG.ACTIVE_JOBS_SET, jobId);
      
      // Add to user's job list
      await redis.client.lPush(`${this.JOB_CONFIG.USER_JOBS_PREFIX}${userId}`, jobId);
      await redis.client.lTrim(`${this.JOB_CONFIG.USER_JOBS_PREFIX}${userId}`, 0, 19);
      
      // Set expiration
      await redis.client.expire(`${this.JOB_CONFIG.KEY_PREFIX}${jobId}`, this.JOB_CONFIG.RESULT_TTL);
      
      console.log(`Created job ${jobId} for user ${userId}: ${jobType}`);
      
      // Return parsed data
      return {
        ...jobData,
        params: params
      };
    } catch (error) {
      console.error('Error creating job:', error);
      throw new Error('Failed to create job');
    }
  }

  /**
   * Update job status atomically with WebSocket support
   */
  async updateJob(jobId, updates, socket = null) {
    try {
      await redis.connect();
      
      // Check if job exists
      const exists = await redis.client.exists(`${this.JOB_CONFIG.KEY_PREFIX}${jobId}`);
      if (!exists) {
        console.warn(`Job ${jobId} not found for update`);
        return false;
      }

      const updateData = {
        ...updates,
        updatedAt: Date.now()
      };

      // Update job data
      await redis.client.hSet(`${this.JOB_CONFIG.KEY_PREFIX}${jobId}`, updateData);
      
      // Emit WebSocket update
      if (socket) {
        socket.emit('job_update', {
          jobId,
          ...updates,
          timestamp: Date.now()
        });
      } else if (global.io) {
        global.io.to(`job_${jobId}`).emit('job_update', {
          jobId,
          ...updates,
          timestamp: Date.now()
        });
      }

      console.log(`📊 Updated job ${jobId}: ${updateData.status || 'status unchanged'} - ${updateData.message || 'no message'}`);
      return true;
    } catch (error) {
      console.error('Error updating job:', error);
      return false;
    }
  }

  /**
   * Get job data by ID
   */
  async getJob(jobId) {
    try {
      await redis.connect();
      const jobData = await redis.client.hGetAll(`${this.JOB_CONFIG.KEY_PREFIX}${jobId}`);
      
      if (!jobData || Object.keys(jobData).length === 0) {
        return null;
      }

      // Convert string values back to appropriate types
      return {
        ...jobData,
        progress: parseInt(jobData.progress) || 0,
        createdAt: parseInt(jobData.createdAt) || 0,
        updatedAt: parseInt(jobData.updatedAt) || 0,
        params: jobData.params ? JSON.parse(jobData.params) : {}
      };
    } catch (error) {
      console.error('Error getting job:', error);
      return null;
    }
  }

  /**
   * Get all jobs for a user
   */
  async getUserJobs(userId, limit = 20) {
    try {
      await redis.connect();
      const jobIds = await redis.client.lRange(`${this.JOB_CONFIG.USER_JOBS_PREFIX}${userId}`, 0, limit - 1);
      
      if (!jobIds || jobIds.length === 0) {
        return [];
      }

      // Get job data for all job IDs
      const jobs = await Promise.all(
        jobIds.map(jobId => this.getJob(jobId))
      );

      return jobs.filter(job => job !== null);
    } catch (error) {
      console.error('Error getting user jobs:', error);
      return [];
    }
  }

  /**
   * Mark job as completed and store result
   */
  async completeJob(jobId, result = null, error = null, socket = null) {
    try {
      await redis.connect();
      
      const updateData = {
        status: error ? 'error' : 'completed',
        progress: 100,
        completedAt: Date.now()
      };

      if (error) {
        updateData.error = error;
        updateData.message = `Job failed: ${error}`;
      } else {
        updateData.message = 'Job completed successfully';
      }

      if (result) {
        // Store large results separately to avoid Redis hash size limits
        const resultKey = `${this.JOB_CONFIG.KEY_PREFIX}${jobId}:result`;
        await redis.client.set(resultKey, JSON.stringify(result));
        await redis.client.expire(resultKey, this.JOB_CONFIG.RESULT_TTL);
        updateData.hasResult = 'true';
      }

      // Update job and remove from active set
      await redis.client.hSet(`${this.JOB_CONFIG.KEY_PREFIX}${jobId}`, updateData);
      await redis.client.sRem(this.JOB_CONFIG.ACTIVE_JOBS_SET, jobId);

      // Emit WebSocket update
      const completeData = {
        jobId,
        status: updateData.status,
        message: updateData.message,
        resultUrl: result ? `/api/job/${jobId}/result` : null,
        timestamp: Date.now()
      };
      
      if (socket) {
        socket.emit('job_complete', completeData);
      } else if (global.io) {
        global.io.to(`job_${jobId}`).emit('job_complete', completeData);
      }

      console.log(`✅ Completed job ${jobId}: ${error ? 'ERROR' : 'SUCCESS'}`);
      return true;
    } catch (redisError) {
      console.error('Error completing job:', redisError);
      return false;
    }
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId, userId = null) {
    try {
      const job = await this.getJob(jobId);
      
      if (!job) {
        return { success: false, message: 'Job not found' };
      }

      // Check if user has permission to cancel
      if (userId && job.userId !== userId.toString()) {
        return { success: false, message: 'Unauthorized to cancel this job' };
      }

      // Don't cancel already completed jobs
      if (job.status === 'completed' || job.status === 'error') {
        return { success: false, message: 'Job already finished' };
      }

      await this.updateJob(jobId, {
        status: 'cancelled',
        message: 'Job cancelled by user',
        cancelledAt: Date.now()
      });

      // Remove from active jobs
      await redis.connect();
      await redis.client.sRem(this.JOB_CONFIG.ACTIVE_JOBS_SET, jobId);

      return { success: true, message: 'Job cancelled successfully' };
    } catch (error) {
      console.error('Error cancelling job:', error);
      return { success: false, message: 'Failed to cancel job' };
    }
  }

  /**
   * Get job result
   */
  async getJobResult(jobId, userId = null) {
    try {
      const job = await this.getJob(jobId);
      
      if (!job) {
        return { success: false, message: 'Job not found', status: 404 };
      }

      // Check permissions
      if (userId && job.userId !== userId.toString()) {
        return { success: false, message: 'Unauthorized to access this job', status: 403 };
      }

      if (job.status !== 'completed') {
        return { 
          success: false, 
          message: `Job not completed. Current status: ${job.status}`,
          status: job.status,
          progress: job.progress
        };
      }

      // Get result from separate key
      let result = null;
      if (job.hasResult === 'true') {
        await redis.connect();
        const resultKey = `${this.JOB_CONFIG.KEY_PREFIX}${jobId}:result`;
        const resultData = await redis.client.get(resultKey);
        if (resultData) {
          result = JSON.parse(resultData);
        }
      }
      
      return {
        success: true,
        jobId,
        status: job.status,
        result,
        completedAt: job.completedAt,
        processingTime: job.completedAt - job.createdAt
      };
    } catch (error) {
      console.error('Error getting job result:', error);
      return { success: false, message: 'Failed to get job result' };
    }
  }

  /**
   * Get all active jobs (admin function)
   */
  async getActiveJobs() {
    try {
      await redis.connect();
      const activeJobIds = await redis.client.sMembers(this.JOB_CONFIG.ACTIVE_JOBS_SET);
      
      if (!activeJobIds || activeJobIds.length === 0) {
        return [];
      }

      const jobs = await Promise.all(
        activeJobIds.map(jobId => this.getJob(jobId))
      );

      return jobs.filter(job => job !== null);
    } catch (error) {
      console.error('Error getting active jobs:', error);
      return [];
    }
  }

  /**
   * Get job statistics
   */
  async getJobStats() {
    try {
      await redis.connect();
      const activeJobIds = await redis.client.sMembers(this.JOB_CONFIG.ACTIVE_JOBS_SET);
      const activeJobs = await Promise.all(
        activeJobIds.map(jobId => this.getJob(jobId))
      );

      const validActiveJobs = activeJobs.filter(job => job !== null);
      
      const stats = {
        total_active: validActiveJobs.length,
        by_status: {},
        by_type: {},
        oldest_job: null,
        newest_job: null
      };

      validActiveJobs.forEach(job => {
        // Count by status
        stats.by_status[job.status] = (stats.by_status[job.status] || 0) + 1;
        
        // Count by type
        stats.by_type[job.jobType] = (stats.by_type[job.jobType] || 0) + 1;
        
        // Track oldest and newest
        if (!stats.oldest_job || job.createdAt < stats.oldest_job.createdAt) {
          stats.oldest_job = job;
        }
        if (!stats.newest_job || job.createdAt > stats.newest_job.createdAt) {
          stats.newest_job = job;
        }
      });

      return stats;
    } catch (error) {
      console.error('Error getting job stats:', error);
      return null;
    }
  }

  /**
   * Cleanup old jobs
   */
  async cleanupOldJobs() {
    try {
      await redis.connect();
      const activeJobIds = await redis.client.sMembers(this.JOB_CONFIG.ACTIVE_JOBS_SET);
      const now = Date.now();
      let cleanedCount = 0;

      for (const jobId of activeJobIds) {
        const job = await this.getJob(jobId);
        
        if (!job) {
          // Remove orphaned job ID from active set
          await redis.client.sRem(this.JOB_CONFIG.ACTIVE_JOBS_SET, jobId);
          cleanedCount++;
          continue;
        }

        // Check if job is too old
        const jobAge = now - job.createdAt;
        if (jobAge > this.JOB_CONFIG.JOB_TIMEOUT) {
          await this.updateJob(jobId, {
            status: 'timeout',
            message: `Job timed out after ${Math.round(jobAge / 60000)} minutes`,
            timeoutAt: now
          });
          
          await redis.client.sRem(this.JOB_CONFIG.ACTIVE_JOBS_SET, jobId);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        console.log(`🧹 Cleaned up ${cleanedCount} old/orphaned jobs`);
      }

      return cleanedCount;
    } catch (error) {
      console.error('Error cleaning up jobs:', error);
      return 0;
    }
  }

  /**
   * Start cleanup interval
   */
  startCleanupInterval() {
    setInterval(() => {
      this.cleanupOldJobs();
    }, this.JOB_CONFIG.CLEANUP_INTERVAL);

    console.log('🔄 Job cleanup interval started');
  }

  /**
   * Check if user can create new job (rate limiting)
   */
  async canUserCreateJob(userId) {
    try {
      const userJobs = await this.getUserJobs(userId, 10);
      const recentJobs = userJobs.filter(job => {
        const jobAge = Date.now() - job.createdAt;
        return jobAge < 60000; // Last minute
      });

      const activeJobs = recentJobs.filter(job => 
        job.status === 'started' || job.status === 'processing'
      );

      return {
        canCreate: activeJobs.length < this.JOB_CONFIG.MAX_CONCURRENT_JOBS,
        activeCount: activeJobs.length,
        maxAllowed: this.JOB_CONFIG.MAX_CONCURRENT_JOBS,
        recentJobsCount: recentJobs.length
      };
    } catch (error) {
      console.error('Error checking user job limits:', error);
      return { canCreate: false, error: 'Failed to check job limits' };
    }
  }
}

module.exports = new JobManager();