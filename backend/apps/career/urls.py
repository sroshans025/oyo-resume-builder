from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter(trailing_slash=True)
router.register("interview-sessions", views.InterviewSessionViewSet, basename="interview-session")
router.register("interview-answers", views.AnswerDraftViewSet, basename="interview-answer")
router.register("portfolio-projects", views.PortfolioProjectViewSet, basename="portfolio-project")
router.register("learning-plans", views.LearningPlanViewSet, basename="learning-plan")
router.register("learning-items", views.LearningPlanItemViewSet, basename="learning-item")

urlpatterns = [
    path("interview-questions/<int:pk>/answers/", views.question_answers, name="question-answers"),
    path("interview/star/", views.star_outline, name="star-outline"),
    *router.urls,
]
