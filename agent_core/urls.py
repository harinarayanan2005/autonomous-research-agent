from django.urls import path
from .views import (
    ResearchSessionListCreateView,
    ResearchSessionDetailView,
    ResearchSessionStreamView,
    ResearchSessionAskView
)

urlpatterns = [
    path('sessions/', ResearchSessionListCreateView.as_view(), name='session-list-create'),
    path('sessions/<uuid:pk>/', ResearchSessionDetailView.as_view(), name='session-detail'),
    path('sessions/<uuid:pk>/stream/', ResearchSessionStreamView.as_view(), name='session-stream'),
    path('sessions/<uuid:pk>/ask/', ResearchSessionAskView.as_view(), name='session-ask'),
]