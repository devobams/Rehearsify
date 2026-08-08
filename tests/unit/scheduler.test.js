import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startScheduler, stopScheduler, getScheduledTasks, JOB_NAME } from '../../src/scheduler/index.js';

describe('Scheduler', () => {
  afterEach(() => {
    stopScheduler();
  });

  it('registers the weeklySongPlanning task by default', () => {
    startScheduler();
    assert.deepEqual(getScheduledTasks(), [JOB_NAME]);
  });

  it('triggers the registered job on demand', async () => {
    let calls = 0;
    const mockJob = async () => {
      calls += 1;
      return { success: true, servicesProcessed: 0 };
    };

    const { task, name } = startScheduler({ schedule: '0 18 * * 0', job: mockJob, name: JOB_NAME });

    assert.equal(name, JOB_NAME);
    assert.deepEqual(getScheduledTasks(), [JOB_NAME]);
    assert.equal(task.getStatus() !== 'stopped', true, 'task should be started');

    await task.execute();
    assert.equal(calls, 1);
  });

  it('replaces a previously registered task with the same name', () => {
    const original = startScheduler({ job: async () => ({}), name: 'foo' });
    startScheduler({ job: async () => ({}), name: 'foo' });
    assert.deepEqual(getScheduledTasks(), ['foo']);
    assert.equal(original.task.getStatus(), 'destroyed', 'replaced task must be destroyed');
  });

  it('stopScheduler destroys every registered task', () => {
    const { task } = startScheduler();
    stopScheduler();
    assert.equal(task.getStatus(), 'destroyed', 'shut-down task must be destroyed');
  });
});
