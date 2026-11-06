"""LangGraph state graph definition: ingestion -> physics -> tutor."""

from langgraph.graph import END, StateGraph

from app.agents.nodes.physics_node import parse_and_compute
from app.agents.nodes.tutor_node import emit_payload, generate_explanation
from app.agents.state import AgentState


def build_graph():
    """Compile the tutor agent graph."""
    graph = StateGraph(AgentState)
    graph.add_node("state_ingestion", lambda state: state)
    graph.add_node("physics_evaluator", parse_and_compute)
    graph.add_node("tutor_response", generate_explanation)
    graph.add_node("emit_payload", emit_payload)

    graph.set_entry_point("state_ingestion")
    graph.add_edge("state_ingestion", "physics_evaluator")
    graph.add_edge("physics_evaluator", "tutor_response")
    graph.add_edge("tutor_response", "emit_payload")
    graph.add_edge("emit_payload", END)
    return graph.compile()
