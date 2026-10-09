import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Hash, Users, X, User, ChevronDown } from 'lucide-react';

interface Student {
    id: string;
    firstName: string;
    lastName: string;
    admissionNumber: string;
    class?: {
        id: string;
        name: string;
    };
}

interface Class {
    id: string;
    name: string;
}

interface StudentSelectorProps {
    students: Student[];
    classes: Class[];
    value: string;
    onChange: (studentId: string) => void;
}

type SelectionMode = 'search' | 'admission' | 'class';

const StudentSelector: React.FC<StudentSelectorProps> = ({
    students,
    classes,
    value,
    onChange
}) => {
    const [mode, setMode] = useState<SelectionMode>('search');
    const [searchQuery, setSearchQuery] = useState('');
    const [admissionQuery, setAdmissionQuery] = useState('');
    const [selectedClassId, setSelectedClassId] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(0);

    const wrapperRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Get selected student details
    const selectedStudent = useMemo(() => {
        return students.find(s => s.id === value);
    }, [students, value]);

    // Filter students based on current mode and query
    const filteredStudents = useMemo(() => {
        let result = students;

        if (mode === 'search' && searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            result = students.filter(s =>
                s.firstName.toLowerCase().includes(query) ||
                s.lastName.toLowerCase().includes(query) ||
                s.admissionNumber.toLowerCase().includes(query) ||
                `${s.firstName} ${s.lastName}`.toLowerCase().includes(query)
            );
        } else if (mode === 'admission' && admissionQuery.trim()) {
            const query = admissionQuery.toLowerCase();
            result = students.filter(s =>
                s.admissionNumber.toLowerCase().includes(query)
            );
        } else if (mode === 'class' && selectedClassId) {
            result = students.filter(s => s.class?.id === selectedClassId);
        } else if (mode === 'search' && !searchQuery.trim()) {
            result = []; // Don't show all students when search is empty
        }

        return result.slice(0, 10); // Limit to 10 results for performance
    }, [students, mode, searchQuery, admissionQuery, selectedClassId]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Handle keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isDropdownOpen) {
            if (e.key === 'ArrowDown' || e.key === 'Enter') {
                setIsDropdownOpen(true);
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightedIndex(prev => Math.min(prev + 1, filteredStudents.length - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex(prev => Math.max(prev - 1, 0));
                break;
            case 'Enter':
                e.preventDefault();
                if (filteredStudents[highlightedIndex]) {
                    selectStudent(filteredStudents[highlightedIndex]);
                }
                break;
            case 'Escape':
                setIsDropdownOpen(false);
                break;
        }
    };

    const selectStudent = (student: Student) => {
        onChange(student.id);
        setSearchQuery('');
        setAdmissionQuery('');
        setIsDropdownOpen(false);
    };

    const clearSelection = () => {
        onChange('');
        setSearchQuery('');
        setAdmissionQuery('');
        setSelectedClassId('');
    };

    // Find student by admission number (exact or partial match)
    const handleAdmissionLookup = () => {
        if (!admissionQuery.trim()) return;

        const exactMatch = students.find(
            s => s.admissionNumber.toLowerCase() === admissionQuery.toLowerCase()
        );

        if (exactMatch) {
            selectStudent(exactMatch);
        } else {
            setIsDropdownOpen(true);
        }
    };

    const modeButtons = [
        { id: 'search' as SelectionMode, icon: Search, label: 'Search' },
        { id: 'admission' as SelectionMode, icon: Hash, label: 'Admission #' },
        { id: 'class' as SelectionMode, icon: Users, label: 'By Class' },
    ];

    return (
        <div ref={wrapperRef} className="relative">
            {/* Selected Student Display */}
            {selectedStudent ? (
                <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
                            {selectedStudent.firstName[0]}{selectedStudent.lastName[0]}
                        </div>
                        <div>
                            <p className="font-medium text-slate-800">
                                {selectedStudent.firstName} {selectedStudent.lastName}
                            </p>
                            <p className="text-sm text-slate-500">
                                {selectedStudent.admissionNumber}
                                {selectedStudent.class && ` • ${selectedStudent.class.name}`}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={clearSelection}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-surface-hover-danger rounded-full transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>
            ) : (
                <>
                    {/* Mode Selector Tabs */}
                    <div className="flex mb-2 bg-slate-100 rounded-lg p-0.5">
                        {modeButtons.map(({ id, icon: Icon, label }) => (
                            <button
                                key={id}
                                type="button"
                                onClick={() => {
                                    setMode(id);
                                    setIsDropdownOpen(false);
                                    setSearchQuery('');
                                    setAdmissionQuery('');
                                    setSelectedClassId('');
                                }}
                                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${mode === id
                                    ? 'bg-white text-blue-600 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                <Icon size={14} />
                                {label}
                            </button>
                        ))}
                    </div>

                    {/* Search Input */}
                    {mode === 'search' && (
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                                ref={inputRef}
                                type="text"
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                    setIsDropdownOpen(true);
                                    setHighlightedIndex(0);
                                }}
                                onFocus={() => searchQuery && setIsDropdownOpen(true)}
                                onKeyDown={handleKeyDown}
                                placeholder="Type student name or admission number..."
                                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                    )}

                    {/* Admission Number Input */}
                    {mode === 'admission' && (
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input
                                    type="text"
                                    value={admissionQuery}
                                    onChange={(e) => {
                                        setAdmissionQuery(e.target.value.toUpperCase());
                                        setIsDropdownOpen(true);
                                        setHighlightedIndex(0);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleAdmissionLookup();
                                        } else {
                                            handleKeyDown(e);
                                        }
                                    }}
                                    placeholder="e.g. STU2024001"
                                    className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={handleAdmissionLookup}
                                className="px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors font-medium"
                            >
                                Find
                            </button>
                        </div>
                    )}

                    {/* Class Selector */}
                    {mode === 'class' && (
                        <div className="space-y-2">
                            <div className="relative">
                                <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <select
                                    value={selectedClassId}
                                    onChange={(e) => {
                                        setSelectedClassId(e.target.value);
                                        setIsDropdownOpen(!!e.target.value);
                                        setHighlightedIndex(0);
                                    }}
                                    className="w-full pl-10 pr-10 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
                                >
                                    <option value="">Select a class first...</option>
                                    {classes.map(cls => (
                                        <option key={cls.id} value={cls.id}>{cls.name}</option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
                            </div>

                            {selectedClassId && (
                                <p className="text-xs text-slate-500">
                                    {filteredStudents.length} student{filteredStudents.length !== 1 ? 's' : ''} in this class
                                </p>
                            )}
                        </div>
                    )}

                    {/* Dropdown Results */}
                    {isDropdownOpen && filteredStudents.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                            {filteredStudents.map((student, index) => (
                                <button
                                    key={student.id}
                                    type="button"
                                    onClick={() => selectStudent(student)}
                                    onMouseEnter={() => setHighlightedIndex(index)}
                                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${index === highlightedIndex ? 'bg-blue-50' : 'hover:bg-surface-hover'
                                        }`}
                                >
                                    <div className="w-9 h-9 bg-slate-200 rounded-full flex items-center justify-center text-slate-600 font-medium text-sm">
                                        {student.firstName[0]}{student.lastName[0]}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-slate-800 truncate">
                                            {student.firstName} {student.lastName}
                                        </p>
                                        <p className="text-sm text-slate-500 truncate">
                                            {student.admissionNumber}
                                            {student.class && ` • ${student.class.name}`}
                                        </p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* No Results Message */}
                    {isDropdownOpen &&
                        ((mode === 'search' && searchQuery && filteredStudents.length === 0) ||
                            (mode === 'admission' && admissionQuery && filteredStudents.length === 0) ||
                            (mode === 'class' && selectedClassId && filteredStudents.length === 0)) && (
                            <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg p-4 text-center">
                                <User className="mx-auto text-slate-300 mb-2" size={32} />
                                <p className="text-slate-500 text-sm">No students found</p>
                            </div>
                        )}
                </>
            )}
        </div>
    );
};

export default StudentSelector;
