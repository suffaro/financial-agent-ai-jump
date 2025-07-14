import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Power, PowerOff } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

interface Rule {
    id: string;
    instruction: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

function Rules() {
    const [rules, setRules] = useState<Rule[]>([]);
    const [loading, setLoading] = useState(true);
    const [showNewRule, setShowNewRule] = useState(false);
    const [editingRule, setEditingRule] = useState<Rule | null>(null);
    const [newInstruction, setNewInstruction] = useState('');

    useEffect(() => {
        fetchRules();
    }, []);

    const fetchRules = async () => {
        try {
            const response = await axios.get('/api/instructions');
            setRules(response.data.instructions);
        } catch (error) {
            console.error('Failed to fetch rules:', error);
            toast.error('Failed to load rules');
        } finally {
            setLoading(false);
        }
    };

    const createRule = async () => {
        if (!newInstruction.trim()) {
            toast.error('Rule instruction is required');
            return;
        }

        try {
            await axios.post('/api/instructions', {
                instruction: newInstruction.trim()
            });

            toast.success('Rule created successfully');
            setNewInstruction('');
            setShowNewRule(false);
            fetchRules();
        } catch (error) {
            console.error('Failed to create rule:', error);
            toast.error('Failed to create rule');
        }
    };

    const toggleRule = async (rule: Rule) => {
        try {
            await axios.patch(`/api/instructions/${rule.id}`, {
                isActive: !rule.isActive
            });

            toast.success(`Rule ${rule.isActive ? 'disabled' : 'enabled'}`);
            fetchRules();
        } catch (error) {
            console.error('Failed to toggle rule:', error);
            toast.error('Failed to update rule');
        }
    };

    const deleteRule = async (ruleId: string) => {
        if (!window.confirm('Are you sure you want to delete this rule?')) {
            return;
        }

        try {
            await axios.delete(`/api/instructions/${ruleId}`);
            toast.success('Rule deleted successfully');
            fetchRules();
        } catch (error) {
            console.error('Failed to delete rule:', error);
            toast.error('Failed to delete rule');
        }
    };

    const updateRule = async (rule: Rule, newInstruction: string) => {
        try {
            await axios.patch(`/api/instructions/${rule.id}`, {
                instruction: newInstruction.trim()
            });

            toast.success('Rule updated successfully');
            setEditingRule(null);
            fetchRules();
        } catch (error) {
            console.error('Failed to update rule:', error);
            toast.error('Failed to update rule');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">AI Rules & Instructions</h1>
                    <p className="mt-1 text-gray-600">
                        Create ongoing instructions for your AI assistant to follow automatically
                    </p>
                </div>
                <button
                    onClick={() => setShowNewRule(true)}
                    className="btn-primary flex items-center space-x-2"
                >
                    <Plus className="h-4 w-4" />
                    <span>Add Rule</span>
                </button>
            </div>

            {/* example rules */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-sm font-medium text-blue-900 mb-2">Example Rules:</h3>
                <ul className="text-sm text-blue-800 space-y-1">
                    <li>• "When someone emails me that is not in HubSpot, create a contact in HubSpot with a note about the email"</li>
                    <li>• "When I create a contact in HubSpot, send them an email saying thank you for being a client"</li>
                    <li>• "When I add an event in my calendar, send an email to attendees about the meeting"</li>
                </ul>
            </div>

            {/* rules list */}
            <div className="space-y-4">
                {rules.length === 0 ? (
                    <div className="text-center py-12">
                        <div className="text-gray-400 mb-4">
                            <Power className="h-12 w-12 mx-auto" />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No rules yet</h3>
                        <p className="text-gray-500 mb-4">
                            Create your first AI rule to automate your workflow
                        </p>
                        <button
                            onClick={() => setShowNewRule(true)}
                            className="btn-primary"
                        >
                            Create First Rule
                        </button>
                    </div>
                ) : (
                    rules.map((rule) => (
                        <div
                            key={rule.id}
                            className={`bg-white border rounded-lg p-6 ${rule.isActive ? 'border-green-200' : 'border-gray-200'
                                }`}
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    {editingRule?.id === rule.id ? (
                                        <div className="space-y-3">
                                            <textarea
                                                defaultValue={rule.instruction}
                                                className="w-full p-3 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                                                rows={3}
                                                placeholder="Enter your rule instruction..."
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && e.ctrlKey) {
                                                        updateRule(rule, e.currentTarget.value);
                                                    }
                                                }}
                                                ref={(input) => input?.focus()}
                                            />
                                            <div className="flex space-x-2">
                                                <button
                                                    onClick={(e) => {
                                                        const textarea = e.currentTarget.parentElement?.previousElementSibling as HTMLTextAreaElement;
                                                        updateRule(rule, textarea.value);
                                                    }}
                                                    className="btn-primary text-sm"
                                                >
                                                    Save
                                                </button>
                                                <button
                                                    onClick={() => setEditingRule(null)}
                                                    className="btn-secondary text-sm"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div>
                                            <p className="text-gray-900 mb-2">{rule.instruction}</p>
                                            <div className="flex items-center space-x-4 text-sm text-gray-500">
                                                <span>Created: {new Date(rule.createdAt).toLocaleString()}</span>
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${rule.isActive
                                                        ? 'bg-green-100 text-green-800'
                                                        : 'bg-gray-100 text-gray-800'
                                                    }`}>
                                                    {rule.isActive ? 'Active' : 'Inactive'}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center space-x-2 ml-4">
                                    <button
                                        onClick={() => toggleRule(rule)}
                                        className={`p-2 rounded-md ${rule.isActive
                                                ? 'text-green-600 hover:bg-green-50'
                                                : 'text-gray-400 hover:bg-gray-50'
                                            }`}
                                        title={rule.isActive ? 'Disable rule' : 'Enable rule'}
                                    >
                                        {rule.isActive ? <Power className="h-4 w-4" /> : <PowerOff className="h-4 w-4" />}
                                    </button>
                                    <button
                                        onClick={() => setEditingRule(rule)}
                                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-md"
                                        title="Edit rule"
                                    >
                                        <Edit2 className="h-4 w-4" />
                                    </button>
                                    <button
                                        onClick={() => deleteRule(rule.id)}
                                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md"
                                        title="Delete rule"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* new rule modal */}
            {showNewRule && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-full max-w-2xl mx-4">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">
                            Create New AI Rule
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Rule Instruction
                                </label>
                                <textarea
                                    value={newInstruction}
                                    onChange={(e) => setNewInstruction(e.target.value)}
                                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                                    rows={4}
                                    placeholder="e.g., When someone emails me that is not in HubSpot, create a contact in HubSpot with a note about the email"
                                />
                            </div>
                            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                                <p className="text-sm text-yellow-800">
                                    <strong>Tip:</strong> Be specific about triggers (when X happens) and actions (do Y).
                                    Your AI will interpret and execute these instructions automatically.
                                </p>
                            </div>
                        </div>
                        <div className="flex space-x-3 mt-6">
                            <button
                                onClick={createRule}
                                className="btn-primary flex-1"
                                disabled={!newInstruction.trim()}
                            >
                                Create Rule
                            </button>
                            <button
                                onClick={() => {
                                    setShowNewRule(false);
                                    setNewInstruction('');
                                }}
                                className="btn-secondary flex-1"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Rules;