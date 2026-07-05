import { useState, useEffect } from 'react';
import { CheckCircle2, Circle, Plus, X, ChevronLeft, ChevronRight } from 'lucide-react';

export default function HabitTracker() {
  const [habits, setHabits] = useState(() => {
    const saved = localStorage.getItem('habits');
    return saved ? JSON.parse(saved) : [];
  });

  const [completions, setCompletions] = useState(() => {
    const saved = localStorage.getItem('completions');
    return saved ? JSON.parse(saved) : {};
  });

  const [newHabit, setNewHabit] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    localStorage.setItem('habits', JSON.stringify(habits));
  }, [habits]);

  useEffect(() => {
    localStorage.setItem('completions', JSON.stringify(completions));
  }, [completions]);

  const addHabit = () => {
    if (newHabit.trim()) {
      const habit = {
        id: Date.now(),
        name: newHabit,
        createdDate: new Date().toISOString().split('T')[0],
      };
      setHabits([...habits, habit]);
      setNewHabit('');
    }
  };

  const removeHabit = (id) => {
    setHabits(habits.filter(h => h.id !== id));
    const newCompletions = { ...completions };
    Object.keys(newCompletions).forEach(key => {
      if (key.startsWith(`${id}:`)) {
        delete newCompletions[key];
      }
    });
    setCompletions(newCompletions);
  };

  const toggleHabit = (habitId) => {
    const key = `${habitId}:${selectedDate}`;
    const newCompletions = { ...completions };
    if (newCompletions[key]) {
      delete newCompletions[key];
    } else {
      newCompletions[key] = true;
    }
    setCompletions(newCompletions);
  };

  const isCompleted = (habitId) => {
    return completions[`${habitId}:${selectedDate}`];
  };

  const getStreak = (habitId) => {
    let streak = 0;
    let checkDate = new Date();
    const habit = habits.find(h => h.id === habitId);
    if (!habit) return 0;

    while (true) {
      const dateStr = checkDate.toISOString().split('T')[0];
      if (new Date(dateStr) < new Date(habit.createdDate)) break;

      if (completions[`${habitId}:${dateStr}`]) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  };

  const changeDate = (days) => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() + days);
    setSelectedDate(date.toISOString().split('T')[0]);
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const today = new Date().toISOString().split('T')[0];

    if (dateStr === today) return 'Today';

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (dateStr === yesterday.toISOString().split('T')[0]) return 'Yesterday';

    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const completedToday = habits.filter(h => isCompleted(h.id)).length;
  const totalHabits = habits.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-6 mt-4">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Daily Habits
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Build consistency, one day at a time
          </p>
        </div>

        {/* Date Navigation */}
        <div className="flex items-center justify-between mb-6 bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
          <button
            onClick={() => changeDate(-1)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
          >
            <ChevronLeft size={20} className="text-gray-600 dark:text-gray-400" />
          </button>

          <div className="text-center">
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {formatDate(selectedDate)}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {completedToday}/{totalHabits} completed
            </p>
          </div>

          <button
            onClick={() => changeDate(1)}
            disabled={selectedDate === new Date().toISOString().split('T')[0]}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight size={20} className="text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        {/* Progress Bar */}
        {totalHabits > 0 && (
          <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-indigo-600 h-3 rounded-full transition-all duration-300"
                style={{ width: `${(completedToday / totalHabits) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Habits List */}
        <div className="space-y-3 mb-6">
          {habits.length === 0 ? (
            <div className="text-center py-8 bg-white dark:bg-gray-800 rounded-lg">
              <p className="text-gray-500 dark:text-gray-400">
                No habits yet. Add one to get started!
              </p>
            </div>
          ) : (
            habits.map(habit => {
              const streak = getStreak(habit.id);
              const completed = isCompleted(habit.id);

              return (
                <div
                  key={habit.id}
                  className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow hover:shadow-md transition flex items-center justify-between"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <button
                      onClick={() => toggleHabit(habit.id)}
                      className="flex-shrink-0 transition-all hover:scale-110"
                    >
                      {completed ? (
                        <CheckCircle2 size={28} className="text-green-500" />
                      ) : (
                        <Circle size={28} className="text-gray-300 dark:text-gray-600 hover:text-gray-400" />
                      )}
                    </button>

                    <div className="text-left">
                      <p className={`font-medium ${completed ? 'text-green-600 dark:text-green-400 line-through' : 'text-gray-900 dark:text-white'}`}>
                        {habit.name}
                      </p>
                      {streak > 0 && (
                        <p className="text-sm text-orange-500 font-semibold">
                          🔥 {streak} day streak
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => removeHabit(habit.id)}
                    className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition text-gray-400 hover:text-red-500"
                  >
                    <X size={20} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Add New Habit */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
          <div className="flex gap-2">
            <input
              type="text"
              value={newHabit}
              onChange={(e) => setNewHabit(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addHabit()}
              placeholder="Add a new habit..."
              className="flex-1 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-4 py-2 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={addHabit}
              className="bg-blue-500 hover:bg-blue-600 text-white rounded-lg px-4 py-2 transition flex items-center gap-2 font-medium"
            >
              <Plus size={20} />
              Add
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-gray-500 dark:text-gray-400 text-sm">
          <p>✨ Data is saved locally on your device</p>
        </div>
      </div>
    </div>
  );
}
