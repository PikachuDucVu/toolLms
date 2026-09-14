import { useEffect, useState } from 'react';
import { listenForStorageResync, readStudentNotes, type StudentNotes } from '../../lib/persistence';

export function useStudentNotes(selectedStudentId: string | null) {
  const [notes, setNotes] = useState<StudentNotes>(() => readStudentNotes());
  const [noteDraft, setNoteDraft] = useState('');

  useEffect(() => {
    setNoteDraft(selectedStudentId ? notes[selectedStudentId] || '' : '');
  }, [notes, selectedStudentId]);
  useEffect(() => listenForStorageResync(() => setNotes(readStudentNotes())), []);

  return { notes, setNotes, noteDraft, setNoteDraft };
}
