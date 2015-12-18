'use strict';
window.app = angular.module('GeoQuest', ['fsaPreBuilt', 'ui.router', 'ui.sortable', 'ui.bootstrap', 'ngAnimate', 'leaflet-directive']);

app.config(function ($urlRouterProvider, $locationProvider) {
				// This turns off hashbang urls (/#about) and changes it to something normal (/about)
				$locationProvider.html5Mode(true);
				// If we go to a URL that ui-router doesn't have registered, go to the "/" url.
				$urlRouterProvider.otherwise('/dashboard');
});

// This app.run is for controlling access to specific states.
app.run(function ($rootScope, AuthService, $state) {

				// The given state requires an authenticated user.
				var destinationStateRequiresAuth = function destinationStateRequiresAuth(state) {
								return state.data && state.data.authenticate;
				};

				// $stateChangeStart is an event fired
				// whenever the process of changing a state begins.
				$rootScope.$on('$stateChangeStart', function (event, toState, toParams) {

								if (!destinationStateRequiresAuth(toState)) {
												// The destination state does not require authentication
												// Short circuit with return.
												return;
								}

								if (AuthService.isAuthenticated()) {
												// The user is authenticated.
												// Short circuit with return.
												return;
								}

								// Cancel navigating to new state.
								event.preventDefault();

								AuthService.getLoggedInUser().then(function (user) {
												// If a user is retrieved, then renavigate to the destination
												// (the second time, AuthService.isAuthenticated() will work)
												// otherwise, if no user is logged in, go to "login" state.
												if (user) {
																$state.go(toState.name, toParams);
												} else {
																$state.go('login');
												}
								});
				});
});

app.config(function ($stateProvider) {

				$stateProvider.state('home', {
								url: '/',
								templateUrl: 'js/home/home.html',
								controller: 'HomeCtrl',
								resolve: {
												requestedUser: function requestedUser(AuthService) {
																return AuthService.getLoggedInUser();
												}
								}
				});
});

app.controller('HomeCtrl', function ($scope, AuthService, $state, requestedUser) {
				// If there's a logged in user upon load, go to the dashboard
				if (requestedUser) $state.go('dashboard', { userId: requestedUser._id });

				$scope.home = true; // To know what nav links to show
				$scope.login = {};
				$scope.signup = {};
				$scope.loginError = null;
				$scope.signupError = null;

				$scope.sendLogin = function (loginInfo) {
								$scope.error = null;

								AuthService.login(loginInfo).then(function (user) {
												$state.go('dashboard', { userId: user._id });
								})['catch'](function () {
												$scope.error = "I think you\'ve entered the wrong info, friend";
								});
				};

				$scope.sendSignup = function (signupInfo) {
								$scope.error = null;
								AuthService.signup(signupInfo).then(function (user) {
												$state.go('dashboard', { userId: user._id }, { reload: true });
								})['catch'](function () {
												$scope.error = "I'm afraid we already have someone by that name";
								});
				};

				// Paralax effect for images
				$(function () {
								// Cache the window object (makes load time faster)
								var $window = $(window);
								// Parallax background effect
								$('section[data-type="background"]').each(function () {
												var $bgobj = $(this); // assigning the object
												$(window).scroll(function () {
																//scroll the background at var speed
																// the yPos is a negative because we're scrolling it up
																var yPos = -($window.scrollTop() / $bgobj.data('speed'));
																// Put together our final background position
																var coords = '50% ' + yPos + 'px';
																// Move the background
																$bgobj.css({ backgroundPosition: coords });
												}); // end window scroll
								});
				});
});
app.config(function ($stateProvider) {
				$stateProvider.state('editor', {
								url: '/editor/:id',
								templateUrl: 'js/quest-editor/editor.html',
								controller: 'EditorCtrl',
								resolve: {
												quest: function quest(QuestFactory, $stateParams) {
																return $stateParams.id !== "" ? QuestFactory.getOneQuest($stateParams.id) : undefined;
												}
								},
								data: {
												authenticate: true
								}
				});
});

app.controller('EditorCtrl', function ($scope, $stateParams, $uibModal, $state, $rootScope, quest, Session, QuestFactory) {
				//variable saved to show/hide quest editor when editing individual states
				$rootScope.editorVisible = true;
				$scope.quest = quest;
				$scope.viewMainMap = true;
				$scope.newQuest = false;
				//if there is no new quest, set properties
				if (!quest) {
								$scope.newQuest = true;
								$scope.quest = {
												start: [40.723008, -74.0006327]
								};
				}
				//update quest and go to dashboard for current user
				$scope.saveQuest = function () {
								if (!$scope.newQuest) {
												return QuestFactory.save($scope.quest).then(function () {
																$state.go('dashboard', { userId: Session.user._id });
												});
								} else {
												return QuestFactory.saveNew($scope.quest).then(function () {
																$state.go('dashboard', { userId: Session.user._id });
												});
								}
				};
				//go to mapStates editor and hide Quest editor
				$scope.transitionToMapStateEditor = function () {
								if (!$scope.newQuest) {
												return QuestFactory.save($scope.quest).then(function () {
																if ($scope.quest.questSteps.length === 0) {
																				$state.go('editor.questStep', { questStepId: null });
																} else {
																				$state.go('editor.questStep', { questStepId: $scope.quest.questSteps[0]._id });
																}
																$scope.editorVisible = false;
												});
								} else {
												return QuestFactory.saveNew($scope.quest).then(function (savedQuest) {
																$scope.editorVisible = false;
																$state.go('editor.questStep', { id: savedQuest._id, questStepId: null });
												});
								}
				};

				//***********  MAP FUNCTIONS BELOW  ***********************
				var questMap = L.map('quest-map').setView($scope.quest.start, 13);

				L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
								maxZoom: 18,
								id: 'scotteggs.o7614jl2',
								accessToken: 'pk.eyJ1Ijoic2NvdHRlZ2dzIiwiYSI6ImNpaDZoZzhmdjBjMDZ1cWo5aGcyaXlteTkifQ.LZe0-IBRQmZ0PkQBsYIliw'
				}).addTo(questMap);

				var drawnItems = new L.FeatureGroup();
				questMap.addLayer(drawnItems);

				// Initialise the draw control and pass it the FeatureGroup of editable layers
				var drawControl = new L.Control.Draw({
								draw: {
												polyline: false,
												polygon: false,
												rectangle: false,
												circle: false
								},
								edit: {
												featureGroup: drawnItems
								}
				});

				questMap.addControl(drawControl);

				var marker = L.marker($scope.quest.start, { draggable: true });
				questMap.addLayer(marker);

				questMap.on('draw:created', function (e) {
								//	remove any existing markers
								if (marker) questMap.removeLayer(marker);
								var type = e.layerType;
								var layer = e.layer;
								//save start location of new marker
								$scope.quest.start = [layer._latlng.lat, layer._latlng.lng];
								//create marker and add to map
								marker = L.marker([layer._latlng.lat, layer._latlng.lng], { draggable: true });
								questMap.addLayer(marker);
				});

				marker.on('dragend', function (e) {
								$scope.quest.start = [e.target._latlng.lat, e.target._latlng.lng];
				});

				if ($scope.newQuest) {
								questMap.locate().on('locationfound', function (e) {
												questMap.setView([e.latitude, e.longitude], 14);
												marker.setLatLng([e.latitude, e.longitude]);
												$scope.quest.start = [e.latitude, e.longitude];
								});
				}
})(function () {

				'use strict';

				// Hope you didn't forget Angular! Duh-doy.
				if (!window.angular) throw new Error('I can\'t find Angular!');

				var app = angular.module('fsaPreBuilt', []);

				app.factory('Socket', function () {
								if (!window.io) throw new Error('socket.io not found!');
								return window.io(window.location.origin);
				});

				// AUTH_EVENTS is used throughout our app to
				// broadcast and listen from and to the $rootScope
				// for important events about authentication flow.
				app.constant('AUTH_EVENTS', {
								loginSuccess: 'auth-login-success',
								loginFailed: 'auth-login-failed',
								logoutSuccess: 'auth-logout-success',
								sessionTimeout: 'auth-session-timeout',
								notAuthenticated: 'auth-not-authenticated',
								notAuthorized: 'auth-not-authorized'
				});

				app.factory('AuthInterceptor', function ($rootScope, $q, AUTH_EVENTS) {
								var statusDict = {
												401: AUTH_EVENTS.notAuthenticated,
												403: AUTH_EVENTS.notAuthorized,
												419: AUTH_EVENTS.sessionTimeout,
												440: AUTH_EVENTS.sessionTimeout
								};
								return {
												responseError: function responseError(response) {
																$rootScope.$broadcast(statusDict[response.status], response);
																return $q.reject(response);
												}
								};
				});

				app.config(function ($httpProvider) {
								$httpProvider.interceptors.push(['$injector', function ($injector) {
												return $injector.get('AuthInterceptor');
								}]);
				});
				app.service('AuthService', function ($http, Session, $rootScope, AUTH_EVENTS, $q) {

								function onSuccessfulLogin(response) {
												var data = response.data;
												Session.create(data.id, data.user);
												$rootScope.$broadcast(AUTH_EVENTS.loginSuccess);
												return data.user;
								}

								// Uses the session factory to see if an
								// authenticated user is currently registered.
								this.isAuthenticated = function () {
												return !!Session.user;
								};

								this.getLoggedInUser = function (fromServer) {

												// If an authenticated session exists, we
												// return the user attached to that session
												// with a promise. This ensures that we can
												// always interface with this method asynchronously.

												// Optionally, if true is given as the fromServer parameter,
												// then this cached value will not be used.

												if (this.isAuthenticated() && fromServer !== true) {
																return $q.when(Session.user);
												}

												// Make request GET /session.
												// If it returns a user, call onSuccessfulLogin with the response.
												// If it returns a 401 response, we catch it and instead resolve to null.
												return $http.get('/session').then(onSuccessfulLogin)['catch'](function () {
																return null;
												});
								};

								this.login = function (credentials) {
												return $http.post('/login', credentials).then(onSuccessfulLogin)['catch'](function () {
																return $q.reject({ message: 'Invalid login credentials.' });
												});
								};

								this.signup = function (credentials) {
												//sends a post request containing the user's credentials to
												return $http.post('api/users/signup', credentials)
												//once the user has been created on the backend...
												.then(function (response) {
																//a second post request is created to log the user in
																return $http.post('/login', credentials);
												}).then(onSuccessfulLogin)['catch'](function () {
																return $q.reject({ message: 'Invalid signup credentials.' });
												});
								};

								this.logout = function () {
												return $http.get('/logout').then(function () {
																Session.destroy();
																$rootScope.$broadcast(AUTH_EVENTS.logoutSuccess);
												});
								};
				});

				app.service('Session', function ($rootScope, AUTH_EVENTS) {

								var self = this;

								$rootScope.$on(AUTH_EVENTS.notAuthenticated, function () {
												self.destroy();
								});

								$rootScope.$on(AUTH_EVENTS.sessionTimeout, function () {
												self.destroy();
								});

								this.id = null;
								this.user = null;

								this.create = function (sessionId, user) {
												this.id = sessionId;
												this.user = user;
								};

								this.destroy = function () {
												this.id = null;
												this.user = null;
								};
				});
})();

app.config(function ($stateProvider) {
				$stateProvider.state('editor.questStep', {
								url: '/queststep/:questStepId',
								templateUrl: 'js/quest-step-editor/quest-step-editor.html',
								controller: 'QuestStepEditCtrl',
								resolve: {
												quest: function quest(QuestFactory, $stateParams) {
																return $stateParams.id !== "" ? QuestFactory.getOneQuest($stateParams.id) : undefined;
												}
								},
								data: {
												authenticate: true
								}
				});
});

app.controller('QuestStepEditCtrl', function ($stateParams, $scope, $state, $rootScope, quest, QuestFactory) {
				$scope.quest = quest;
				$rootScope.editorVisible = false;
				$scope.viewMap = true;

				//defind new Step for adding to steps array
				$scope.newStep = {
								name: 'New Step',
								targetCircle: {
												center: [],
												radius: null
								}
				};
				//if we have steps, find the index of the step that matches the params
				if ($scope.quest.questSteps.length > 0) {
								$scope.quest.questSteps.forEach(function (step, index) {
												if (step._id === $stateParams.questStepId) {
																$scope.quest.idx = index;
												}
								});
								//sets currentStep to that matching the parameters
								$scope.currentStep = $scope.quest.questSteps[$scope.quest.idx];
				} else {
								$scope.quest.questSteps.push($scope.newStep);
								$scope.currentStep = $scope.quest.questSteps[0];
				}
				//function to switch states within mapState editor
				$scope.switchStep = function (clickedStep) {
								QuestFactory.save($scope.quest).then(function () {
												// redirect to the clicked mapstate
												$state.go('editor.questStep', { questStepId: clickedStep._id });
								});
				};
				$scope.saveQuestSteps = function () {
								//updates current mapState
								QuestFactory.save($scope.quest).then(function (updatedQuest) {
												$scope.quest = updatedQuest;
												$state.go('editor', { id: $scope.quest._id }, { reload: true });
								});
				};
				$scope.returnWithoutSaving = function () {
								$state.go('editor', { id: $scope.quest._id }, { reload: true });
				};
				$scope.addQuestStep = function () {
								$scope.quest.questSteps.push($scope.newStep);
								return QuestFactory.save($scope.quest).then(function (updatedQuest) {
												$scope.quest = updatedQuest;
												$state.go('editor.questStep', { questStepId: $scope.quest.questSteps[$scope.quest.questSteps.length - 1]._id });
								});
				};
				$scope.removeQuestStep = function () {
								var index = $scope.quest.questSteps.indexOf($scope.currentStep);
								$scope.quest.questSteps.splice(index, 1);
								if (index === $scope.quest.questSteps.length) index--;
								return QuestFactory.save($scope.quest).then(function (updatedQuest) {
												$scope.quest = updatedQuest;
												var stepDestination = $scope.quest.questSteps.length === 0 ? null : $scope.quest.questSteps[index]._id;
												$state.go('editor.questStep', { questStepId: stepDestination }, { reload: true });
								});
				};

				// //function to set map to either target region or map starting point if no target region
				var mapView = function mapView() {

								if ($scope.currentStep.targetCircle.center.length === 2) {
												return $scope.currentStep.targetCircle.center;
								} else {
												return $scope.quest.start;
								}
				};
				// //initialize map and set view using mapView function
				var questStepMap = L.map('quest-step-map').setView(mapView(), 15);
				//add pirate map tiles
				L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
								maxZoom: 18,
								id: 'scotteggs.o7614jl2',
								accessToken: 'pk.eyJ1Ijoic2NvdHRlZ2dzIiwiYSI6ImNpaDZoZzhmdjBjMDZ1cWo5aGcyaXlteTkifQ.LZe0-IBRQmZ0PkQBsYIliw'
				}).addTo(questStepMap);

				// Initialize the FeatureGroup to store editable layers
				var drawnItems = new L.FeatureGroup();
				questStepMap.addLayer(drawnItems);

				// Initialize the draw control and pass it the FeatureGroup of editable layers
				var drawControl = new L.Control.Draw({
								draw: {
												polyline: false,
												polygon: false,
												rectangle: false,
												marker: false
								},
								edit: {
												featureGroup: drawnItems
								}
				});
				questStepMap.addControl(drawControl);
				//if there is a target region, draw it on the map
				if ($scope.currentStep.targetCircle.center.length === 2) {
								var currentRegion = L.circle($scope.currentStep.targetCircle.center, $scope.currentStep.targetCircle.radius);
								questStepMap.addLayer(currentRegion);
				}
				var circle;
				questStepMap.on('draw:created', function (e) {
								//remove the loaded region then remove any newly drawn circles
								if (currentRegion) questStepMap.removeLayer(currentRegion);
								if (circle) questStepMap.removeLayer(circle);
								var type = e.layerType;
								var layer = e.layer;
								//assign target region to properties of drawn object
								$scope.currentStep.targetCircle.center = [layer._latlng.lat, layer._latlng.lng];
								$scope.currentStep.targetCircle.radius = layer._mRadius;
								//declare new object based on propertied drawn and add to map
								circle = L.circle([layer._latlng.lat, layer._latlng.lng], layer._mRadius);
								questStepMap.addLayer(circle);
				});

				$scope.getModalButtonText = function () {
								if ($scope.currentStep.transitionInfo.question.length) return "Submit!";
								return "Got it!";
				};
});

app.config(function ($stateProvider) {
				$stateProvider.state('dashboard', {
								url: '/dashboard/:userId',
								templateUrl: 'js/user-dashboard/dashboard.html',
								controller: 'DashCtrl',
								resolve: {
												userQuests: function userQuests(QuestFactory, $stateParams) {
																return QuestFactory.getUserQuests($stateParams.userId);
												}
								},
								data: {
												authenticate: true
								}
				});
});

app.controller('DashCtrl', function ($state, $scope, userQuests, Session, QuestFactory) {
				$scope.dashboard = true;
				$scope.quests = [];
				$scope.quests = userQuests.map(function (g) {
								g.showDetail = false;
								return g;
				});

				$scope.goToEditor = function (questClicked) {
								$state.go('editor', { id: questClicked._id }, { reload: true });
				};
				$scope.deleteQuest = function (questClicked) {
								return QuestFactory['delete'](questClicked).then(function (deletedQuest) {
												$state.go('dashboard', { userId: Session.user._id }, { reload: true });
								});
				};
				$scope.parentClick = function (index) {
								var quest = $scope.quests[index];
								quest.showDetail = !quest.showDetail;
				};
				$scope.switchActive = function (questClicked) {
								QuestFactory.switchActive(questClicked);
				};
});

app.factory('QuestFactory', function ($http, Session) {

				return {

								getAllQuests: function getAllQuests() {
												return $http.get('/api/quests').then(function (res) {
																return res.data;
												});
								},
								getOneQuest: function getOneQuest(questId) {
												return $http.get('/api/quests/' + questId).then(function (res) {
																return res.data;
												});
								},
								getUserQuests: function getUserQuests(userId) {
												return $http.get('/api/quests/userquests/' + userId).then(function (res) {
																return res.data;
												});
								},
								switchActive: function switchActive(quest) {
												return $http.put('/api/quests/' + quest._id, quest).then(function (res) {
																return res.data;
												});
								},
								saveNew: function saveNew(quest) {
												quest.author = Session.user._id;
												return $http.post('/api/quests/', quest).then(function (res) {
																return res.data;
												});
								},
								'delete': function _delete(quest) {
												return $http['delete']('/api/quests/' + quest._id);
								}
				};
});

app.directive('fullstackLogo', function () {
				return {
								restrict: 'E',
								templateUrl: 'js/common/directives/fullstack-logo/fullstack-logo.html'
				};
});
app.directive('navbar', function ($rootScope, AuthService, AUTH_EVENTS, $state) {

				return {
								restrict: 'E',
								scope: {
												home: '=',
												dashboard: '='
								},
								templateUrl: 'js/common/directives/navbar/navbar.html',
								link: function link(scope) {

												scope.items = [{ label: 'Dashboard', state: 'home', auth: true }, { label: 'New Quest', state: 'editor', auth: true }];

												scope.user = null;

												scope.isLoggedIn = function () {
																return AuthService.isAuthenticated();
												};

												scope.logout = function () {
																AuthService.logout().then(function () {
																				$state.go('home');
																});
												};

												var setUser = function setUser() {
																AuthService.getLoggedInUser().then(function (user) {
																				scope.user = user;
																});
												};

												var removeUser = function removeUser() {
																scope.user = null;
												};

												setUser();

												$rootScope.$on(AUTH_EVENTS.loginSuccess, setUser);
												$rootScope.$on(AUTH_EVENTS.logoutSuccess, removeUser);
												$rootScope.$on(AUTH_EVENTS.sessionTimeout, removeUser);

												// If not 'Home', remove scroll animation
												$rootScope.$on('$stateChangeSuccess', function (event, toState) {
																if (toState.name !== 'home') {
																				$('.navbar-fixed-top').addClass('top-nav-collapse');
																} else {
																				$('.navbar-fixed-top').removeClass('top-nav-collapse');
																}
												});

												// Pretty Scrolling Navbar Effect
												$(window).scroll(function () {
																if ($('.navbar').offset().top > 50 && scope.home) {
																				$('.navbar-fixed-top').addClass('top-nav-collapse');
																} else {
																				$('.navbar-fixed-top').removeClass('top-nav-collapse');
																}
												});

												// Animated Scroll To Section
												$(function () {
																$('.page-scroll a').bind('click', function () {
																				var $anchor = $(this);
																				$('html, body').stop().animate({
																								scrollTop: $($anchor.attr('href')).offset().top
																				}, 1500, 'easeInOutExpo');
																				event.preventDefault();
																});
												});
								}

				};
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImFwcC5qcyIsImhvbWUvaG9tZS5qcyIsInF1ZXN0LWVkaXRvci9lZGl0b3IuanMiLCJmc2EvZnNhLXByZS1idWlsdC5qcyIsInF1ZXN0LXN0ZXAtZWRpdG9yL3F1ZXN0LXN0ZXAtZWRpdG9yLmpzIiwidXNlci1kYXNoYm9hcmQvZGFzaGJvYXJkLmpzIiwiY29tbW9uL2ZhY3Rvcmllcy9xdWVzdEZhY3RvcnkuanMiLCJjb21tb24vZGlyZWN0aXZlcy9mdWxsc3RhY2stbG9nby9mdWxsc3RhY2stbG9nby5qcyIsImNvbW1vbi9kaXJlY3RpdmVzL25hdmJhci9uYXZiYXIuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBQSxDQUFBO0FBQ0EsTUFBQSxDQUFBLEdBQUEsR0FBQSxPQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsRUFBQSxDQUFBLGFBQUEsRUFBQSxXQUFBLEVBQUEsYUFBQSxFQUFBLGNBQUEsRUFBQSxXQUFBLEVBQUEsbUJBQUEsQ0FBQSxDQUFBLENBQUE7O0FBRUEsR0FBQSxDQUFBLE1BQUEsQ0FBQSxVQUFBLGtCQUFBLEVBQUEsaUJBQUEsRUFBQTs7QUFFQSxxQkFBQSxDQUFBLFNBQUEsQ0FBQSxJQUFBLENBQUEsQ0FBQTs7QUFFQSxzQkFBQSxDQUFBLFNBQUEsQ0FBQSxZQUFBLENBQUEsQ0FBQTtDQUNBLENBQUEsQ0FBQTs7O0FBR0EsR0FBQSxDQUFBLEdBQUEsQ0FBQSxVQUFBLFVBQUEsRUFBQSxXQUFBLEVBQUEsTUFBQSxFQUFBOzs7QUFHQSxRQUFBLDRCQUFBLEdBQUEsU0FBQSw0QkFBQSxDQUFBLEtBQUEsRUFBQTtBQUNBLGVBQUEsS0FBQSxDQUFBLElBQUEsSUFBQSxLQUFBLENBQUEsSUFBQSxDQUFBLFlBQUEsQ0FBQTtLQUNBLENBQUE7Ozs7QUFJQSxjQUFBLENBQUEsR0FBQSxDQUFBLG1CQUFBLEVBQUEsVUFBQSxLQUFBLEVBQUEsT0FBQSxFQUFBLFFBQUEsRUFBQTs7QUFFQSxZQUFBLENBQUEsNEJBQUEsQ0FBQSxPQUFBLENBQUEsRUFBQTs7O0FBR0EsbUJBQUE7U0FDQTs7QUFFQSxZQUFBLFdBQUEsQ0FBQSxlQUFBLEVBQUEsRUFBQTs7O0FBR0EsbUJBQUE7U0FDQTs7O0FBR0EsYUFBQSxDQUFBLGNBQUEsRUFBQSxDQUFBOztBQUVBLG1CQUFBLENBQUEsZUFBQSxFQUFBLENBQUEsSUFBQSxDQUFBLFVBQUEsSUFBQSxFQUFBOzs7O0FBSUEsZ0JBQUEsSUFBQSxFQUFBO0FBQ0Esc0JBQUEsQ0FBQSxFQUFBLENBQUEsT0FBQSxDQUFBLElBQUEsRUFBQSxRQUFBLENBQUEsQ0FBQTthQUNBLE1BQUE7QUFDQSxzQkFBQSxDQUFBLEVBQUEsQ0FBQSxPQUFBLENBQUEsQ0FBQTthQUNBO1NBQ0EsQ0FBQSxDQUFBO0tBRUEsQ0FBQSxDQUFBO0NBRUEsQ0FBQSxDQUFBOztBQ2xEQSxHQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsY0FBQSxFQUFBOztBQUVBLGtCQUFBLENBQUEsS0FBQSxDQUFBLE1BQUEsRUFBQTtBQUNBLFdBQUEsRUFBQSxHQUFBO0FBQ0EsbUJBQUEsRUFBQSxtQkFBQTtBQUNBLGtCQUFBLEVBQUEsVUFBQTtBQUNBLGVBQUEsRUFBQTtBQUNBLHlCQUFBLEVBQUEsdUJBQUEsV0FBQSxFQUFBO0FBQ0EsdUJBQUEsV0FBQSxDQUFBLGVBQUEsRUFBQSxDQUFBO2FBQ0E7U0FDQTtLQUNBLENBQUEsQ0FBQTtDQUVBLENBQUEsQ0FBQTs7QUFFQSxHQUFBLENBQUEsVUFBQSxDQUFBLFVBQUEsRUFBQSxVQUFBLE1BQUEsRUFBQSxXQUFBLEVBQUEsTUFBQSxFQUFBLGFBQUEsRUFBQTs7QUFFQSxRQUFBLGFBQUEsRUFBQSxNQUFBLENBQUEsRUFBQSxDQUFBLFdBQUEsRUFBQSxFQUFBLE1BQUEsRUFBQSxhQUFBLENBQUEsR0FBQSxFQUFBLENBQUEsQ0FBQTs7QUFFQSxVQUFBLENBQUEsSUFBQSxHQUFBLElBQUEsQ0FBQTtBQUNBLFVBQUEsQ0FBQSxLQUFBLEdBQUEsRUFBQSxDQUFBO0FBQ0EsVUFBQSxDQUFBLE1BQUEsR0FBQSxFQUFBLENBQUE7QUFDQSxVQUFBLENBQUEsVUFBQSxHQUFBLElBQUEsQ0FBQTtBQUNBLFVBQUEsQ0FBQSxXQUFBLEdBQUEsSUFBQSxDQUFBOztBQUVBLFVBQUEsQ0FBQSxTQUFBLEdBQUEsVUFBQSxTQUFBLEVBQUE7QUFDQSxjQUFBLENBQUEsS0FBQSxHQUFBLElBQUEsQ0FBQTs7QUFFQSxtQkFBQSxDQUFBLEtBQUEsQ0FBQSxTQUFBLENBQUEsQ0FBQSxJQUFBLENBQUEsVUFBQSxJQUFBLEVBQUE7QUFDQSxrQkFBQSxDQUFBLEVBQUEsQ0FBQSxXQUFBLEVBQUEsRUFBQSxNQUFBLEVBQUEsSUFBQSxDQUFBLEdBQUEsRUFBQSxDQUFBLENBQUE7U0FDQSxDQUFBLFNBQUEsQ0FBQSxZQUFBO0FBQ0Esa0JBQUEsQ0FBQSxLQUFBLEdBQUEsZ0RBQUEsQ0FBQTtTQUNBLENBQUEsQ0FBQTtLQUVBLENBQUE7O0FBRUEsVUFBQSxDQUFBLFVBQUEsR0FBQSxVQUFBLFVBQUEsRUFBQTtBQUNBLGNBQUEsQ0FBQSxLQUFBLEdBQUEsSUFBQSxDQUFBO0FBQ0EsbUJBQUEsQ0FBQSxNQUFBLENBQUEsVUFBQSxDQUFBLENBQUEsSUFBQSxDQUFBLFVBQUEsSUFBQSxFQUFBO0FBQ0Esa0JBQUEsQ0FBQSxFQUFBLENBQUEsV0FBQSxFQUFBLEVBQUEsTUFBQSxFQUFBLElBQUEsQ0FBQSxHQUFBLEVBQUEsRUFBQSxFQUFBLE1BQUEsRUFBQSxJQUFBLEVBQUEsQ0FBQSxDQUFBO1NBQ0EsQ0FBQSxTQUFBLENBQUEsWUFBQTtBQUNBLGtCQUFBLENBQUEsS0FBQSxHQUFBLGlEQUFBLENBQUE7U0FDQSxDQUFBLENBQUE7S0FDQSxDQUFBOzs7QUFHQSxLQUFBLENBQUEsWUFBQTs7QUFFQSxZQUFBLE9BQUEsR0FBQSxDQUFBLENBQUEsTUFBQSxDQUFBLENBQUE7O0FBRUEsU0FBQSxDQUFBLGlDQUFBLENBQUEsQ0FBQSxJQUFBLENBQUEsWUFBQTtBQUNBLGdCQUFBLE1BQUEsR0FBQSxDQUFBLENBQUEsSUFBQSxDQUFBLENBQUE7QUFDQSxhQUFBLENBQUEsTUFBQSxDQUFBLENBQUEsTUFBQSxDQUFBLFlBQUE7OztBQUdBLG9CQUFBLElBQUEsR0FBQSxFQUFBLE9BQUEsQ0FBQSxTQUFBLEVBQUEsR0FBQSxNQUFBLENBQUEsSUFBQSxDQUFBLE9BQUEsQ0FBQSxDQUFBLENBQUE7O0FBRUEsb0JBQUEsTUFBQSxHQUFBLE1BQUEsR0FBQSxJQUFBLEdBQUEsSUFBQSxDQUFBOztBQUVBLHNCQUFBLENBQUEsR0FBQSxDQUFBLEVBQUEsa0JBQUEsRUFBQSxNQUFBLEVBQUEsQ0FBQSxDQUFBO2FBQ0EsQ0FBQSxDQUFBO1NBQ0EsQ0FBQSxDQUFBO0tBQ0EsQ0FBQSxDQUFBO0NBSUEsQ0FBQSxDQUFBO0FDbEVBLEdBQUEsQ0FBQSxNQUFBLENBQUEsVUFBQSxjQUFBLEVBQUE7QUFDQSxrQkFBQSxDQUFBLEtBQUEsQ0FBQSxRQUFBLEVBQ0E7QUFDQSxXQUFBLEVBQUEsYUFBQTtBQUNBLG1CQUFBLEVBQUEsNkJBQUE7QUFDQSxrQkFBQSxFQUFBLFlBQUE7QUFDQSxlQUFBLEVBQUE7QUFDQSxpQkFBQSxFQUFBLGVBQUEsWUFBQSxFQUFBLFlBQUEsRUFBQTtBQUNBLHVCQUFBLFlBQUEsQ0FBQSxFQUFBLEtBQUEsRUFBQSxHQUNBLFlBQUEsQ0FBQSxXQUFBLENBQUEsWUFBQSxDQUFBLEVBQUEsQ0FBQSxHQUNBLFNBQUEsQ0FBQTthQUNBO1NBQ0E7QUFDQSxZQUFBLEVBQUE7QUFDQSx3QkFBQSxFQUFBLElBQUE7U0FDQTtLQUNBLENBQUEsQ0FBQTtDQUNBLENBQUEsQ0FBQTs7QUFFQSxHQUFBLENBQUEsVUFBQSxDQUFBLFlBQUEsRUFBQSxVQUFBLE1BQUEsRUFBQSxZQUFBLEVBQUEsU0FBQSxFQUFBLE1BQUEsRUFBQSxVQUFBLEVBQUEsS0FBQSxFQUFBLE9BQUEsRUFBQSxZQUFBLEVBQUE7O0FBRUEsY0FBQSxDQUFBLGFBQUEsR0FBQSxJQUFBLENBQUE7QUFDQSxVQUFBLENBQUEsS0FBQSxHQUFBLEtBQUEsQ0FBQTtBQUNBLFVBQUEsQ0FBQSxXQUFBLEdBQUEsSUFBQSxDQUFBO0FBQ0EsVUFBQSxDQUFBLFFBQUEsR0FBQSxLQUFBLENBQUE7O0FBRUEsUUFBQSxDQUFBLEtBQUEsRUFBQTtBQUNBLGNBQUEsQ0FBQSxRQUFBLEdBQUEsSUFBQSxDQUFBO0FBQ0EsY0FBQSxDQUFBLEtBQUEsR0FBQTtBQUNBLGlCQUFBLEVBQUEsQ0FBQSxTQUFBLEVBQUEsQ0FBQSxVQUFBLENBQUE7U0FDQSxDQUFBO0tBQ0E7O0FBRUEsVUFBQSxDQUFBLFNBQUEsR0FBQSxZQUFBO0FBQ0EsWUFBQSxDQUFBLE1BQUEsQ0FBQSxRQUFBLEVBQUE7QUFDQSxtQkFBQSxZQUFBLENBQUEsSUFBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsWUFBQTtBQUNBLHNCQUFBLENBQUEsRUFBQSxDQUFBLFdBQUEsRUFBQSxFQUFBLE1BQUEsRUFBQSxPQUFBLENBQUEsSUFBQSxDQUFBLEdBQUEsRUFBQSxDQUFBLENBQUE7YUFDQSxDQUFBLENBQUE7U0FDQSxNQUFBO0FBQ0EsbUJBQUEsWUFBQSxDQUFBLE9BQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFlBQUE7QUFDQSxzQkFBQSxDQUFBLEVBQUEsQ0FBQSxXQUFBLEVBQUEsRUFBQSxNQUFBLEVBQUEsT0FBQSxDQUFBLElBQUEsQ0FBQSxHQUFBLEVBQUEsQ0FBQSxDQUFBO2FBQ0EsQ0FBQSxDQUFBO1NBQ0E7S0FDQSxDQUFBOztBQUVBLFVBQUEsQ0FBQSwwQkFBQSxHQUFBLFlBQUE7QUFDQSxZQUFBLENBQUEsTUFBQSxDQUFBLFFBQUEsRUFBQTtBQUNBLG1CQUFBLFlBQUEsQ0FBQSxJQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxZQUFBO0FBQ0Esb0JBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsTUFBQSxLQUFBLENBQUEsRUFBQTtBQUNBLDBCQUFBLENBQUEsRUFBQSxDQUFBLGtCQUFBLEVBQUEsRUFBQSxXQUFBLEVBQUEsSUFBQSxFQUFBLENBQUEsQ0FBQTtpQkFDQSxNQUFBO0FBQ0EsMEJBQUEsQ0FBQSxFQUFBLENBQUEsa0JBQUEsRUFBQSxFQUFBLFdBQUEsRUFBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxDQUFBLENBQUEsQ0FBQSxHQUFBLEVBQUEsQ0FBQSxDQUFBO2lCQUNBO0FBQ0Esc0JBQUEsQ0FBQSxhQUFBLEdBQUEsS0FBQSxDQUFBO2FBQ0EsQ0FBQSxDQUFBO1NBQ0EsTUFBQTtBQUNBLG1CQUFBLFlBQUEsQ0FBQSxPQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxVQUFBLFVBQUEsRUFBQTtBQUNBLHNCQUFBLENBQUEsYUFBQSxHQUFBLEtBQUEsQ0FBQTtBQUNBLHNCQUFBLENBQUEsRUFBQSxDQUFBLGtCQUFBLEVBQUEsRUFBQSxFQUFBLEVBQUEsVUFBQSxDQUFBLEdBQUEsRUFBQSxXQUFBLEVBQUEsSUFBQSxFQUFBLENBQUEsQ0FBQTthQUNBLENBQUEsQ0FBQTtTQUNBO0tBQ0EsQ0FBQTs7O0FBR0EsUUFBQSxRQUFBLEdBQUEsQ0FBQSxDQUFBLEdBQUEsQ0FBQSxXQUFBLENBQUEsQ0FBQSxPQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxLQUFBLEVBQUEsRUFBQSxDQUFBLENBQUE7O0FBRUEsS0FBQSxDQUFBLFNBQUEsQ0FBQSxpRkFBQSxFQUFBO0FBQ0EsZUFBQSxFQUFBLEVBQUE7QUFDQSxVQUFBLEVBQUEsb0JBQUE7QUFDQSxtQkFBQSxFQUFBLDhGQUFBO0tBQ0EsQ0FBQSxDQUFBLEtBQUEsQ0FBQSxRQUFBLENBQUEsQ0FBQTs7QUFFQSxRQUFBLFVBQUEsR0FBQSxJQUFBLENBQUEsQ0FBQSxZQUFBLEVBQUEsQ0FBQTtBQUNBLFlBQUEsQ0FBQSxRQUFBLENBQUEsVUFBQSxDQUFBLENBQUE7OztBQUdBLFFBQUEsV0FBQSxHQUFBLElBQUEsQ0FBQSxDQUFBLE9BQUEsQ0FBQSxJQUFBLENBQUE7QUFDQSxZQUFBLEVBQUE7QUFDQSxvQkFBQSxFQUFBLEtBQUE7QUFDQSxtQkFBQSxFQUFBLEtBQUE7QUFDQSxxQkFBQSxFQUFBLEtBQUE7QUFDQSxrQkFBQSxFQUFBLEtBQUE7U0FDQTtBQUNBLFlBQUEsRUFBQTtBQUNBLHdCQUFBLEVBQUEsVUFBQTtTQUNBO0tBQ0EsQ0FBQSxDQUFBOztBQUVBLFlBQUEsQ0FBQSxVQUFBLENBQUEsV0FBQSxDQUFBLENBQUE7O0FBRUEsUUFBQSxNQUFBLEdBQUEsQ0FBQSxDQUFBLE1BQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLEtBQUEsRUFBQSxFQUFBLFNBQUEsRUFBQSxJQUFBLEVBQUEsQ0FBQSxDQUFBO0FBQ0EsWUFBQSxDQUFBLFFBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQTs7QUFFQSxZQUFBLENBQUEsRUFBQSxDQUFBLGNBQUEsRUFBQSxVQUFBLENBQUEsRUFBQTs7QUFFQSxZQUFBLE1BQUEsRUFBQSxRQUFBLENBQUEsV0FBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBO0FBQ0EsWUFBQSxJQUFBLEdBQUEsQ0FBQSxDQUFBLFNBQUEsQ0FBQTtBQUNBLFlBQUEsS0FBQSxHQUFBLENBQUEsQ0FBQSxLQUFBLENBQUE7O0FBRUEsY0FBQSxDQUFBLEtBQUEsQ0FBQSxLQUFBLEdBQUEsQ0FBQSxLQUFBLENBQUEsT0FBQSxDQUFBLEdBQUEsRUFBQSxLQUFBLENBQUEsT0FBQSxDQUFBLEdBQUEsQ0FBQSxDQUFBOztBQUVBLGNBQUEsR0FBQSxDQUFBLENBQUEsTUFBQSxDQUFBLENBQUEsS0FBQSxDQUFBLE9BQUEsQ0FBQSxHQUFBLEVBQUEsS0FBQSxDQUFBLE9BQUEsQ0FBQSxHQUFBLENBQUEsRUFBQSxFQUFBLFNBQUEsRUFBQSxJQUFBLEVBQUEsQ0FBQSxDQUFBO0FBQ0EsZ0JBQUEsQ0FBQSxRQUFBLENBQUEsTUFBQSxDQUFBLENBQUE7S0FDQSxDQUFBLENBQUE7O0FBRUEsVUFBQSxDQUFBLEVBQUEsQ0FBQSxTQUFBLEVBQUEsVUFBQSxDQUFBLEVBQUE7QUFDQSxjQUFBLENBQUEsS0FBQSxDQUFBLEtBQUEsR0FBQSxDQUFBLENBQUEsQ0FBQSxNQUFBLENBQUEsT0FBQSxDQUFBLEdBQUEsRUFBQSxDQUFBLENBQUEsTUFBQSxDQUFBLE9BQUEsQ0FBQSxHQUFBLENBQUEsQ0FBQTtLQUNBLENBQUEsQ0FBQTs7QUFFQSxRQUFBLE1BQUEsQ0FBQSxRQUFBLEVBQUE7QUFDQSxnQkFBQSxDQUFBLE1BQUEsRUFBQSxDQUFBLEVBQUEsQ0FBQSxlQUFBLEVBQUEsVUFBQSxDQUFBLEVBQUE7QUFDQSxvQkFBQSxDQUFBLE9BQUEsQ0FBQSxDQUFBLENBQUEsQ0FBQSxRQUFBLEVBQUEsQ0FBQSxDQUFBLFNBQUEsQ0FBQSxFQUFBLEVBQUEsQ0FBQSxDQUFBO0FBQ0Esa0JBQUEsQ0FBQSxTQUFBLENBQUEsQ0FBQSxDQUFBLENBQUEsUUFBQSxFQUFBLENBQUEsQ0FBQSxTQUFBLENBQUEsQ0FBQSxDQUFBO0FBQ0Esa0JBQUEsQ0FBQSxLQUFBLENBQUEsS0FBQSxHQUFBLENBQUEsQ0FBQSxDQUFBLFFBQUEsRUFBQSxDQUFBLENBQUEsU0FBQSxDQUFBLENBQUE7U0FDQSxDQUFBLENBQUE7S0FDQTtDQUVBLENBQUEsQ0N6SEEsWUFBQTs7QUFFQSxnQkFBQSxDQUFBOzs7QUFHQSxRQUFBLENBQUEsTUFBQSxDQUFBLE9BQUEsRUFBQSxNQUFBLElBQUEsS0FBQSxDQUFBLHdCQUFBLENBQUEsQ0FBQTs7QUFFQSxRQUFBLEdBQUEsR0FBQSxPQUFBLENBQUEsTUFBQSxDQUFBLGFBQUEsRUFBQSxFQUFBLENBQUEsQ0FBQTs7QUFFQSxPQUFBLENBQUEsT0FBQSxDQUFBLFFBQUEsRUFBQSxZQUFBO0FBQ0EsWUFBQSxDQUFBLE1BQUEsQ0FBQSxFQUFBLEVBQUEsTUFBQSxJQUFBLEtBQUEsQ0FBQSxzQkFBQSxDQUFBLENBQUE7QUFDQSxlQUFBLE1BQUEsQ0FBQSxFQUFBLENBQUEsTUFBQSxDQUFBLFFBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQTtLQUNBLENBQUEsQ0FBQTs7Ozs7QUFLQSxPQUFBLENBQUEsUUFBQSxDQUFBLGFBQUEsRUFBQTtBQUNBLG9CQUFBLEVBQUEsb0JBQUE7QUFDQSxtQkFBQSxFQUFBLG1CQUFBO0FBQ0EscUJBQUEsRUFBQSxxQkFBQTtBQUNBLHNCQUFBLEVBQUEsc0JBQUE7QUFDQSx3QkFBQSxFQUFBLHdCQUFBO0FBQ0EscUJBQUEsRUFBQSxxQkFBQTtLQUNBLENBQUEsQ0FBQTs7QUFFQSxPQUFBLENBQUEsT0FBQSxDQUFBLGlCQUFBLEVBQUEsVUFBQSxVQUFBLEVBQUEsRUFBQSxFQUFBLFdBQUEsRUFBQTtBQUNBLFlBQUEsVUFBQSxHQUFBO0FBQ0EsZUFBQSxFQUFBLFdBQUEsQ0FBQSxnQkFBQTtBQUNBLGVBQUEsRUFBQSxXQUFBLENBQUEsYUFBQTtBQUNBLGVBQUEsRUFBQSxXQUFBLENBQUEsY0FBQTtBQUNBLGVBQUEsRUFBQSxXQUFBLENBQUEsY0FBQTtTQUNBLENBQUE7QUFDQSxlQUFBO0FBQ0EseUJBQUEsRUFBQSx1QkFBQSxRQUFBLEVBQUE7QUFDQSwwQkFBQSxDQUFBLFVBQUEsQ0FBQSxVQUFBLENBQUEsUUFBQSxDQUFBLE1BQUEsQ0FBQSxFQUFBLFFBQUEsQ0FBQSxDQUFBO0FBQ0EsdUJBQUEsRUFBQSxDQUFBLE1BQUEsQ0FBQSxRQUFBLENBQUEsQ0FBQTthQUNBO1NBQ0EsQ0FBQTtLQUNBLENBQUEsQ0FBQTs7QUFFQSxPQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsYUFBQSxFQUFBO0FBQ0EscUJBQUEsQ0FBQSxZQUFBLENBQUEsSUFBQSxDQUFBLENBQ0EsV0FBQSxFQUNBLFVBQUEsU0FBQSxFQUFBO0FBQ0EsbUJBQUEsU0FBQSxDQUFBLEdBQUEsQ0FBQSxpQkFBQSxDQUFBLENBQUE7U0FDQSxDQUNBLENBQUEsQ0FBQTtLQUNBLENBQUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxPQUFBLENBQUEsYUFBQSxFQUFBLFVBQUEsS0FBQSxFQUFBLE9BQUEsRUFBQSxVQUFBLEVBQUEsV0FBQSxFQUFBLEVBQUEsRUFBQTs7QUFFQSxpQkFBQSxpQkFBQSxDQUFBLFFBQUEsRUFBQTtBQUNBLGdCQUFBLElBQUEsR0FBQSxRQUFBLENBQUEsSUFBQSxDQUFBO0FBQ0EsbUJBQUEsQ0FBQSxNQUFBLENBQUEsSUFBQSxDQUFBLEVBQUEsRUFBQSxJQUFBLENBQUEsSUFBQSxDQUFBLENBQUE7QUFDQSxzQkFBQSxDQUFBLFVBQUEsQ0FBQSxXQUFBLENBQUEsWUFBQSxDQUFBLENBQUE7QUFDQSxtQkFBQSxJQUFBLENBQUEsSUFBQSxDQUFBO1NBQ0E7Ozs7QUFJQSxZQUFBLENBQUEsZUFBQSxHQUFBLFlBQUE7QUFDQSxtQkFBQSxDQUFBLENBQUEsT0FBQSxDQUFBLElBQUEsQ0FBQTtTQUNBLENBQUE7O0FBRUEsWUFBQSxDQUFBLGVBQUEsR0FBQSxVQUFBLFVBQUEsRUFBQTs7Ozs7Ozs7OztBQVVBLGdCQUFBLElBQUEsQ0FBQSxlQUFBLEVBQUEsSUFBQSxVQUFBLEtBQUEsSUFBQSxFQUFBO0FBQ0EsdUJBQUEsRUFBQSxDQUFBLElBQUEsQ0FBQSxPQUFBLENBQUEsSUFBQSxDQUFBLENBQUE7YUFDQTs7Ozs7QUFLQSxtQkFBQSxLQUFBLENBQUEsR0FBQSxDQUFBLFVBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBQSxpQkFBQSxDQUFBLFNBQUEsQ0FBQSxZQUFBO0FBQ0EsdUJBQUEsSUFBQSxDQUFBO2FBQ0EsQ0FBQSxDQUFBO1NBRUEsQ0FBQTs7QUFFQSxZQUFBLENBQUEsS0FBQSxHQUFBLFVBQUEsV0FBQSxFQUFBO0FBQ0EsbUJBQUEsS0FBQSxDQUFBLElBQUEsQ0FBQSxRQUFBLEVBQUEsV0FBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLGlCQUFBLENBQUEsU0FDQSxDQUFBLFlBQUE7QUFDQSx1QkFBQSxFQUFBLENBQUEsTUFBQSxDQUFBLEVBQUEsT0FBQSxFQUFBLDRCQUFBLEVBQUEsQ0FBQSxDQUFBO2FBQ0EsQ0FBQSxDQUFBO1NBQ0EsQ0FBQTs7QUFHQSxZQUFBLENBQUEsTUFBQSxHQUFBLFVBQUEsV0FBQSxFQUFBOztBQUVBLG1CQUFBLEtBQUEsQ0FBQSxJQUFBLENBQUEsa0JBQUEsRUFBQSxXQUFBLENBQUE7O2FBRUEsSUFBQSxDQUFBLFVBQUEsUUFBQSxFQUFBOztBQUVBLHVCQUFBLEtBQUEsQ0FBQSxJQUFBLENBQUEsUUFBQSxFQUFBLFdBQUEsQ0FBQSxDQUFBO2FBQ0EsQ0FBQSxDQUNBLElBQUEsQ0FBQSxpQkFBQSxDQUFBLFNBQ0EsQ0FBQSxZQUFBO0FBQ0EsdUJBQUEsRUFBQSxDQUFBLE1BQUEsQ0FBQSxFQUFBLE9BQUEsRUFBQSw2QkFBQSxFQUFBLENBQUEsQ0FBQTthQUNBLENBQUEsQ0FBQTtTQUNBLENBQUE7O0FBRUEsWUFBQSxDQUFBLE1BQUEsR0FBQSxZQUFBO0FBQ0EsbUJBQUEsS0FBQSxDQUFBLEdBQUEsQ0FBQSxTQUFBLENBQUEsQ0FBQSxJQUFBLENBQUEsWUFBQTtBQUNBLHVCQUFBLENBQUEsT0FBQSxFQUFBLENBQUE7QUFDQSwwQkFBQSxDQUFBLFVBQUEsQ0FBQSxXQUFBLENBQUEsYUFBQSxDQUFBLENBQUE7YUFDQSxDQUFBLENBQUE7U0FDQSxDQUFBO0tBRUEsQ0FBQSxDQUFBOztBQUVBLE9BQUEsQ0FBQSxPQUFBLENBQUEsU0FBQSxFQUFBLFVBQUEsVUFBQSxFQUFBLFdBQUEsRUFBQTs7QUFFQSxZQUFBLElBQUEsR0FBQSxJQUFBLENBQUE7O0FBRUEsa0JBQUEsQ0FBQSxHQUFBLENBQUEsV0FBQSxDQUFBLGdCQUFBLEVBQUEsWUFBQTtBQUNBLGdCQUFBLENBQUEsT0FBQSxFQUFBLENBQUE7U0FDQSxDQUFBLENBQUE7O0FBRUEsa0JBQUEsQ0FBQSxHQUFBLENBQUEsV0FBQSxDQUFBLGNBQUEsRUFBQSxZQUFBO0FBQ0EsZ0JBQUEsQ0FBQSxPQUFBLEVBQUEsQ0FBQTtTQUNBLENBQUEsQ0FBQTs7QUFFQSxZQUFBLENBQUEsRUFBQSxHQUFBLElBQUEsQ0FBQTtBQUNBLFlBQUEsQ0FBQSxJQUFBLEdBQUEsSUFBQSxDQUFBOztBQUVBLFlBQUEsQ0FBQSxNQUFBLEdBQUEsVUFBQSxTQUFBLEVBQUEsSUFBQSxFQUFBO0FBQ0EsZ0JBQUEsQ0FBQSxFQUFBLEdBQUEsU0FBQSxDQUFBO0FBQ0EsZ0JBQUEsQ0FBQSxJQUFBLEdBQUEsSUFBQSxDQUFBO1NBQ0EsQ0FBQTs7QUFFQSxZQUFBLENBQUEsT0FBQSxHQUFBLFlBQUE7QUFDQSxnQkFBQSxDQUFBLEVBQUEsR0FBQSxJQUFBLENBQUE7QUFDQSxnQkFBQSxDQUFBLElBQUEsR0FBQSxJQUFBLENBQUE7U0FDQSxDQUFBO0tBRUEsQ0FBQSxDQUFBO0NBRUEsQ0FBQSxFQUFBLENBQUE7O0FDbEpBLEdBQUEsQ0FBQSxNQUFBLENBQUEsVUFBQSxjQUFBLEVBQUE7QUFDQSxrQkFBQSxDQUFBLEtBQUEsQ0FBQSxrQkFBQSxFQUFBO0FBQ0EsV0FBQSxFQUFBLHlCQUFBO0FBQ0EsbUJBQUEsRUFBQSw2Q0FBQTtBQUNBLGtCQUFBLEVBQUEsbUJBQUE7QUFDQSxlQUFBLEVBQUE7QUFDQSxpQkFBQSxFQUFBLGVBQUEsWUFBQSxFQUFBLFlBQUEsRUFBQTtBQUNBLHVCQUFBLFlBQUEsQ0FBQSxFQUFBLEtBQUEsRUFBQSxHQUNBLFlBQUEsQ0FBQSxXQUFBLENBQUEsWUFBQSxDQUFBLEVBQUEsQ0FBQSxHQUNBLFNBQUEsQ0FBQTthQUNBO1NBQ0E7QUFDQSxZQUFBLEVBQUE7QUFDQSx3QkFBQSxFQUFBLElBQUE7U0FDQTtLQUNBLENBQUEsQ0FBQTtDQUNBLENBQUEsQ0FBQTs7QUFHQSxHQUFBLENBQUEsVUFBQSxDQUFBLG1CQUFBLEVBQUEsVUFBQSxZQUFBLEVBQUEsTUFBQSxFQUFBLE1BQUEsRUFBQSxVQUFBLEVBQUEsS0FBQSxFQUFBLFlBQUEsRUFBQTtBQUNBLFVBQUEsQ0FBQSxLQUFBLEdBQUEsS0FBQSxDQUFBO0FBQ0EsY0FBQSxDQUFBLGFBQUEsR0FBQSxLQUFBLENBQUE7QUFDQSxVQUFBLENBQUEsT0FBQSxHQUFBLElBQUEsQ0FBQTs7O0FBR0EsVUFBQSxDQUFBLE9BQUEsR0FBQTtBQUNBLFlBQUEsRUFBQSxVQUFBO0FBQ0Esb0JBQUEsRUFBQTtBQUNBLGtCQUFBLEVBQUEsRUFBQTtBQUNBLGtCQUFBLEVBQUEsSUFBQTtTQUNBO0tBQ0EsQ0FBQTs7QUFFQSxRQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLE1BQUEsR0FBQSxDQUFBLEVBQUE7QUFDQSxjQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxPQUFBLENBQUEsVUFBQSxJQUFBLEVBQUEsS0FBQSxFQUFBO0FBQ0EsZ0JBQUEsSUFBQSxDQUFBLEdBQUEsS0FBQSxZQUFBLENBQUEsV0FBQSxFQUFBO0FBQ0Esc0JBQUEsQ0FBQSxLQUFBLENBQUEsR0FBQSxHQUFBLEtBQUEsQ0FBQTthQUNBO1NBQ0EsQ0FBQSxDQUFBOztBQUVBLGNBQUEsQ0FBQSxXQUFBLEdBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxHQUFBLENBQUEsQ0FBQTtLQUNBLE1BQUE7QUFDQSxjQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxJQUFBLENBQUEsTUFBQSxDQUFBLE9BQUEsQ0FBQSxDQUFBO0FBQ0EsY0FBQSxDQUFBLFdBQUEsR0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxDQUFBLENBQUEsQ0FBQTtLQUNBOztBQUVBLFVBQUEsQ0FBQSxVQUFBLEdBQUEsVUFBQSxXQUFBLEVBQUE7QUFDQSxvQkFBQSxDQUFBLElBQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFlBQUE7O0FBRUEsa0JBQUEsQ0FBQSxFQUFBLENBQUEsa0JBQUEsRUFBQSxFQUFBLFdBQUEsRUFBQSxXQUFBLENBQUEsR0FBQSxFQUFBLENBQUEsQ0FBQTtTQUNBLENBQUEsQ0FBQTtLQUNBLENBQUE7QUFDQSxVQUFBLENBQUEsY0FBQSxHQUFBLFlBQUE7O0FBRUEsb0JBQUEsQ0FBQSxJQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxVQUFBLFlBQUEsRUFBQTtBQUNBLGtCQUFBLENBQUEsS0FBQSxHQUFBLFlBQUEsQ0FBQTtBQUNBLGtCQUFBLENBQUEsRUFBQSxDQUFBLFFBQUEsRUFBQSxFQUFBLEVBQUEsRUFBQSxNQUFBLENBQUEsS0FBQSxDQUFBLEdBQUEsRUFBQSxFQUFBLEVBQUEsTUFBQSxFQUFBLElBQUEsRUFBQSxDQUFBLENBQUE7U0FDQSxDQUFBLENBQUE7S0FDQSxDQUFBO0FBQ0EsVUFBQSxDQUFBLG1CQUFBLEdBQUEsWUFBQTtBQUNBLGNBQUEsQ0FBQSxFQUFBLENBQUEsUUFBQSxFQUFBLEVBQUEsRUFBQSxFQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsR0FBQSxFQUFBLEVBQUEsRUFBQSxNQUFBLEVBQUEsSUFBQSxFQUFBLENBQUEsQ0FBQTtLQUNBLENBQUE7QUFDQSxVQUFBLENBQUEsWUFBQSxHQUFBLFlBQUE7QUFDQSxjQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxJQUFBLENBQUEsTUFBQSxDQUFBLE9BQUEsQ0FBQSxDQUFBO0FBQ0EsZUFBQSxZQUFBLENBQUEsSUFBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsVUFBQSxZQUFBLEVBQUE7QUFDQSxrQkFBQSxDQUFBLEtBQUEsR0FBQSxZQUFBLENBQUE7QUFDQSxrQkFBQSxDQUFBLEVBQUEsQ0FBQSxrQkFBQSxFQUFBLEVBQUEsV0FBQSxFQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLE1BQUEsR0FBQSxDQUFBLENBQUEsQ0FBQSxHQUFBLEVBQUEsQ0FBQSxDQUFBO1NBQ0EsQ0FBQSxDQUFBO0tBRUEsQ0FBQTtBQUNBLFVBQUEsQ0FBQSxlQUFBLEdBQUEsWUFBQTtBQUNBLFlBQUEsS0FBQSxHQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLE9BQUEsQ0FBQSxNQUFBLENBQUEsV0FBQSxDQUFBLENBQUE7QUFDQSxjQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxFQUFBLENBQUEsQ0FBQSxDQUFBO0FBQ0EsWUFBQSxLQUFBLEtBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsTUFBQSxFQUFBLEtBQUEsRUFBQSxDQUFBO0FBQ0EsZUFBQSxZQUFBLENBQUEsSUFBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsVUFBQSxZQUFBLEVBQUE7QUFDQSxrQkFBQSxDQUFBLEtBQUEsR0FBQSxZQUFBLENBQUE7QUFDQSxnQkFBQSxlQUFBLEdBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsTUFBQSxLQUFBLENBQUEsR0FBQSxJQUFBLEdBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsS0FBQSxDQUFBLENBQUEsR0FBQSxDQUFBO0FBQ0Esa0JBQUEsQ0FBQSxFQUFBLENBQUEsa0JBQUEsRUFBQSxFQUFBLFdBQUEsRUFBQSxlQUFBLEVBQUEsRUFBQSxFQUFBLE1BQUEsRUFBQSxJQUFBLEVBQUEsQ0FBQSxDQUFBO1NBQ0EsQ0FBQSxDQUFBO0tBQ0EsQ0FBQTs7O0FBR0EsUUFBQSxPQUFBLEdBQUEsU0FBQSxPQUFBLEdBQUE7O0FBRUEsWUFBQSxNQUFBLENBQUEsV0FBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLENBQUEsTUFBQSxLQUFBLENBQUEsRUFBQTtBQUNBLG1CQUFBLE1BQUEsQ0FBQSxXQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsQ0FBQTtTQUNBLE1BQUE7QUFDQSxtQkFBQSxNQUFBLENBQUEsS0FBQSxDQUFBLEtBQUEsQ0FBQTtTQUNBO0tBQ0EsQ0FBQTs7QUFFQSxRQUFBLFlBQUEsR0FBQSxDQUFBLENBQUEsR0FBQSxDQUFBLGdCQUFBLENBQUEsQ0FBQSxPQUFBLENBQUEsT0FBQSxFQUFBLEVBQUEsRUFBQSxDQUFBLENBQUE7O0FBRUEsS0FBQSxDQUFBLFNBQUEsQ0FBQSxpRkFBQSxFQUFBO0FBQ0EsZUFBQSxFQUFBLEVBQUE7QUFDQSxVQUFBLEVBQUEsb0JBQUE7QUFDQSxtQkFBQSxFQUFBLDhGQUFBO0tBQ0EsQ0FBQSxDQUFBLEtBQUEsQ0FBQSxZQUFBLENBQUEsQ0FBQTs7O0FBR0EsUUFBQSxVQUFBLEdBQUEsSUFBQSxDQUFBLENBQUEsWUFBQSxFQUFBLENBQUE7QUFDQSxnQkFBQSxDQUFBLFFBQUEsQ0FBQSxVQUFBLENBQUEsQ0FBQTs7O0FBR0EsUUFBQSxXQUFBLEdBQUEsSUFBQSxDQUFBLENBQUEsT0FBQSxDQUFBLElBQUEsQ0FBQTtBQUNBLFlBQUEsRUFBQTtBQUNBLG9CQUFBLEVBQUEsS0FBQTtBQUNBLG1CQUFBLEVBQUEsS0FBQTtBQUNBLHFCQUFBLEVBQUEsS0FBQTtBQUNBLGtCQUFBLEVBQUEsS0FBQTtTQUNBO0FBQ0EsWUFBQSxFQUFBO0FBQ0Esd0JBQUEsRUFBQSxVQUFBO1NBQ0E7S0FDQSxDQUFBLENBQUE7QUFDQSxnQkFBQSxDQUFBLFVBQUEsQ0FBQSxXQUFBLENBQUEsQ0FBQTs7QUFFQSxRQUFBLE1BQUEsQ0FBQSxXQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsQ0FBQSxNQUFBLEtBQUEsQ0FBQSxFQUFBO0FBQ0EsWUFBQSxhQUFBLEdBQUEsQ0FBQSxDQUFBLE1BQUEsQ0FBQSxNQUFBLENBQUEsV0FBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLEVBQUEsTUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxDQUFBLENBQUE7QUFDQSxvQkFBQSxDQUFBLFFBQUEsQ0FBQSxhQUFBLENBQUEsQ0FBQTtLQUNBO0FBQ0EsUUFBQSxNQUFBLENBQUE7QUFDQSxnQkFBQSxDQUFBLEVBQUEsQ0FBQSxjQUFBLEVBQUEsVUFBQSxDQUFBLEVBQUE7O0FBRUEsWUFBQSxhQUFBLEVBQUEsWUFBQSxDQUFBLFdBQUEsQ0FBQSxhQUFBLENBQUEsQ0FBQTtBQUNBLFlBQUEsTUFBQSxFQUFBLFlBQUEsQ0FBQSxXQUFBLENBQUEsTUFBQSxDQUFBLENBQUE7QUFDQSxZQUFBLElBQUEsR0FBQSxDQUFBLENBQUEsU0FBQSxDQUFBO0FBQ0EsWUFBQSxLQUFBLEdBQUEsQ0FBQSxDQUFBLEtBQUEsQ0FBQTs7QUFFQSxjQUFBLENBQUEsV0FBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLEdBQUEsQ0FBQSxLQUFBLENBQUEsT0FBQSxDQUFBLEdBQUEsRUFBQSxLQUFBLENBQUEsT0FBQSxDQUFBLEdBQUEsQ0FBQSxDQUFBO0FBQ0EsY0FBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxHQUFBLEtBQUEsQ0FBQSxRQUFBLENBQUE7O0FBRUEsY0FBQSxHQUFBLENBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQSxLQUFBLENBQUEsT0FBQSxDQUFBLEdBQUEsRUFBQSxLQUFBLENBQUEsT0FBQSxDQUFBLEdBQUEsQ0FBQSxFQUFBLEtBQUEsQ0FBQSxRQUFBLENBQUEsQ0FBQTtBQUNBLG9CQUFBLENBQUEsUUFBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBO0tBQ0EsQ0FBQSxDQUFBOztBQUVBLFVBQUEsQ0FBQSxrQkFBQSxHQUFBLFlBQUE7QUFDQSxZQUFBLE1BQUEsQ0FBQSxXQUFBLENBQUEsY0FBQSxDQUFBLFFBQUEsQ0FBQSxNQUFBLEVBQUEsT0FBQSxTQUFBLENBQUE7QUFDQSxlQUFBLFNBQUEsQ0FBQTtLQUNBLENBQUE7Q0FDQSxDQUFBLENBQUE7O0FDaEpBLEdBQUEsQ0FBQSxNQUFBLENBQUEsVUFBQSxjQUFBLEVBQUE7QUFDQSxrQkFBQSxDQUFBLEtBQUEsQ0FBQSxXQUFBLEVBQUE7QUFDQSxXQUFBLEVBQUEsb0JBQUE7QUFDQSxtQkFBQSxFQUFBLGtDQUFBO0FBQ0Esa0JBQUEsRUFBQSxVQUFBO0FBQ0EsZUFBQSxFQUFBO0FBQ0Esc0JBQUEsRUFBQSxvQkFBQSxZQUFBLEVBQUEsWUFBQSxFQUFBO0FBQ0EsdUJBQUEsWUFBQSxDQUFBLGFBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxDQUFBLENBQUE7YUFDQTtTQUNBO0FBQ0EsWUFBQSxFQUFBO0FBQ0Esd0JBQUEsRUFBQSxJQUFBO1NBQ0E7S0FDQSxDQUFBLENBQUE7Q0FDQSxDQUFBLENBQUE7O0FBRUEsR0FBQSxDQUFBLFVBQUEsQ0FBQSxVQUFBLEVBQUEsVUFBQSxNQUFBLEVBQUEsTUFBQSxFQUFBLFVBQUEsRUFBQSxPQUFBLEVBQUEsWUFBQSxFQUFBO0FBQ0EsVUFBQSxDQUFBLFNBQUEsR0FBQSxJQUFBLENBQUE7QUFDQSxVQUFBLENBQUEsTUFBQSxHQUFBLEVBQUEsQ0FBQTtBQUNBLFVBQUEsQ0FBQSxNQUFBLEdBQUEsVUFBQSxDQUFBLEdBQUEsQ0FBQSxVQUFBLENBQUEsRUFBQTtBQUNBLFNBQUEsQ0FBQSxVQUFBLEdBQUEsS0FBQSxDQUFBO0FBQ0EsZUFBQSxDQUFBLENBQUE7S0FDQSxDQUFBLENBQUE7O0FBRUEsVUFBQSxDQUFBLFVBQUEsR0FBQSxVQUFBLFlBQUEsRUFBQTtBQUNBLGNBQUEsQ0FBQSxFQUFBLENBQUEsUUFBQSxFQUFBLEVBQUEsRUFBQSxFQUFBLFlBQUEsQ0FBQSxHQUFBLEVBQUEsRUFBQSxFQUFBLE1BQUEsRUFBQSxJQUFBLEVBQUEsQ0FBQSxDQUFBO0tBQ0EsQ0FBQTtBQUNBLFVBQUEsQ0FBQSxXQUFBLEdBQUEsVUFBQSxZQUFBLEVBQUE7QUFDQSxlQUFBLFlBQUEsVUFBQSxDQUFBLFlBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxVQUFBLFlBQUEsRUFBQTtBQUNBLGtCQUFBLENBQUEsRUFBQSxDQUFBLFdBQUEsRUFBQSxFQUFBLE1BQUEsRUFBQSxPQUFBLENBQUEsSUFBQSxDQUFBLEdBQUEsRUFBQSxFQUFBLEVBQUEsTUFBQSxFQUFBLElBQUEsRUFBQSxDQUFBLENBQUE7U0FDQSxDQUFBLENBQUE7S0FDQSxDQUFBO0FBQ0EsVUFBQSxDQUFBLFdBQUEsR0FBQSxVQUFBLEtBQUEsRUFBQTtBQUNBLFlBQUEsS0FBQSxHQUFBLE1BQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLENBQUE7QUFDQSxhQUFBLENBQUEsVUFBQSxHQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQTtLQUNBLENBQUE7QUFDQSxVQUFBLENBQUEsWUFBQSxHQUFBLFVBQUEsWUFBQSxFQUFBO0FBQ0Esb0JBQUEsQ0FBQSxZQUFBLENBQUEsWUFBQSxDQUFBLENBQUE7S0FDQSxDQUFBO0NBQ0EsQ0FBQSxDQUFBOztBQ3hDQSxHQUFBLENBQUEsT0FBQSxDQUFBLGNBQUEsRUFBQSxVQUFBLEtBQUEsRUFBQSxPQUFBLEVBQUE7O0FBRUEsV0FBQTs7QUFFQSxvQkFBQSxFQUFBLHdCQUFBO0FBQ0EsbUJBQUEsS0FBQSxDQUFBLEdBQUEsQ0FBQSxhQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsVUFBQSxHQUFBLEVBQUE7QUFDQSx1QkFBQSxHQUFBLENBQUEsSUFBQSxDQUFBO2FBQ0EsQ0FBQSxDQUFBO1NBQ0E7QUFDQSxtQkFBQSxFQUFBLHFCQUFBLE9BQUEsRUFBQTtBQUNBLG1CQUFBLEtBQUEsQ0FBQSxHQUFBLENBQUEsY0FBQSxHQUFBLE9BQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxVQUFBLEdBQUEsRUFBQTtBQUNBLHVCQUFBLEdBQUEsQ0FBQSxJQUFBLENBQUE7YUFDQSxDQUFBLENBQUE7U0FDQTtBQUNBLHFCQUFBLEVBQUEsdUJBQUEsTUFBQSxFQUFBO0FBQ0EsbUJBQUEsS0FBQSxDQUFBLEdBQUEsQ0FBQSx5QkFBQSxHQUFBLE1BQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxVQUFBLEdBQUEsRUFBQTtBQUNBLHVCQUFBLEdBQUEsQ0FBQSxJQUFBLENBQUE7YUFDQSxDQUFBLENBQUE7U0FDQTtBQUNBLG9CQUFBLEVBQUEsc0JBQUEsS0FBQSxFQUFBO0FBQ0EsbUJBQUEsS0FBQSxDQUFBLEdBQUEsQ0FBQSxjQUFBLEdBQUEsS0FBQSxDQUFBLEdBQUEsRUFBQSxLQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsVUFBQSxHQUFBLEVBQUE7QUFDQSx1QkFBQSxHQUFBLENBQUEsSUFBQSxDQUFBO2FBQ0EsQ0FBQSxDQUFBO1NBQ0E7QUFDQSxlQUFBLEVBQUEsaUJBQUEsS0FBQSxFQUFBO0FBQ0EsaUJBQUEsQ0FBQSxNQUFBLEdBQUEsT0FBQSxDQUFBLElBQUEsQ0FBQSxHQUFBLENBQUE7QUFDQSxtQkFBQSxLQUFBLENBQUEsSUFBQSxDQUFBLGNBQUEsRUFBQSxLQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsVUFBQSxHQUFBLEVBQUE7QUFDQSx1QkFBQSxHQUFBLENBQUEsSUFBQSxDQUFBO2FBQ0EsQ0FBQSxDQUFBO1NBQ0E7QUFDQSxrQkFBQSxpQkFBQSxLQUFBLEVBQUE7QUFDQSxtQkFBQSxLQUFBLFVBQUEsQ0FBQSxjQUFBLEdBQUEsS0FBQSxDQUFBLEdBQUEsQ0FBQSxDQUFBO1NBQ0E7S0FDQSxDQUFBO0NBQ0EsQ0FBQSxDQUFBOztBQ3ZDQSxHQUFBLENBQUEsU0FBQSxDQUFBLGVBQUEsRUFBQSxZQUFBO0FBQ0EsV0FBQTtBQUNBLGdCQUFBLEVBQUEsR0FBQTtBQUNBLG1CQUFBLEVBQUEseURBQUE7S0FDQSxDQUFBO0NBQ0EsQ0FBQSxDQUFBO0FDTEEsR0FBQSxDQUFBLFNBQUEsQ0FBQSxRQUFBLEVBQUEsVUFBQSxVQUFBLEVBQUEsV0FBQSxFQUFBLFdBQUEsRUFBQSxNQUFBLEVBQUE7O0FBRUEsV0FBQTtBQUNBLGdCQUFBLEVBQUEsR0FBQTtBQUNBLGFBQUEsRUFBQTtBQUNBLGdCQUFBLEVBQUEsR0FBQTtBQUNBLHFCQUFBLEVBQUEsR0FBQTtTQUNBO0FBQ0EsbUJBQUEsRUFBQSx5Q0FBQTtBQUNBLFlBQUEsRUFBQSxjQUFBLEtBQUEsRUFBQTs7QUFFQSxpQkFBQSxDQUFBLEtBQUEsR0FBQSxDQUNBLEVBQUEsS0FBQSxFQUFBLFdBQUEsRUFBQSxLQUFBLEVBQUEsTUFBQSxFQUFBLElBQUEsRUFBQSxJQUFBLEVBQUEsRUFDQSxFQUFBLEtBQUEsRUFBQSxXQUFBLEVBQUEsS0FBQSxFQUFBLFFBQUEsRUFBQSxJQUFBLEVBQUEsSUFBQSxFQUFBLENBQ0EsQ0FBQTs7QUFFQSxpQkFBQSxDQUFBLElBQUEsR0FBQSxJQUFBLENBQUE7O0FBRUEsaUJBQUEsQ0FBQSxVQUFBLEdBQUEsWUFBQTtBQUNBLHVCQUFBLFdBQUEsQ0FBQSxlQUFBLEVBQUEsQ0FBQTthQUNBLENBQUE7O0FBRUEsaUJBQUEsQ0FBQSxNQUFBLEdBQUEsWUFBQTtBQUNBLDJCQUFBLENBQUEsTUFBQSxFQUFBLENBQUEsSUFBQSxDQUFBLFlBQUE7QUFDQSwwQkFBQSxDQUFBLEVBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQTtpQkFDQSxDQUFBLENBQUE7YUFDQSxDQUFBOztBQUVBLGdCQUFBLE9BQUEsR0FBQSxTQUFBLE9BQUEsR0FBQTtBQUNBLDJCQUFBLENBQUEsZUFBQSxFQUFBLENBQUEsSUFBQSxDQUFBLFVBQUEsSUFBQSxFQUFBO0FBQ0EseUJBQUEsQ0FBQSxJQUFBLEdBQUEsSUFBQSxDQUFBO2lCQUNBLENBQUEsQ0FBQTthQUNBLENBQUE7O0FBRUEsZ0JBQUEsVUFBQSxHQUFBLFNBQUEsVUFBQSxHQUFBO0FBQ0EscUJBQUEsQ0FBQSxJQUFBLEdBQUEsSUFBQSxDQUFBO2FBQ0EsQ0FBQTs7QUFFQSxtQkFBQSxFQUFBLENBQUE7O0FBRUEsc0JBQUEsQ0FBQSxHQUFBLENBQUEsV0FBQSxDQUFBLFlBQUEsRUFBQSxPQUFBLENBQUEsQ0FBQTtBQUNBLHNCQUFBLENBQUEsR0FBQSxDQUFBLFdBQUEsQ0FBQSxhQUFBLEVBQUEsVUFBQSxDQUFBLENBQUE7QUFDQSxzQkFBQSxDQUFBLEdBQUEsQ0FBQSxXQUFBLENBQUEsY0FBQSxFQUFBLFVBQUEsQ0FBQSxDQUFBOzs7QUFHQSxzQkFBQSxDQUFBLEdBQUEsQ0FBQSxxQkFBQSxFQUFBLFVBQUEsS0FBQSxFQUFBLE9BQUEsRUFBQTtBQUNBLG9CQUFBLE9BQUEsQ0FBQSxJQUFBLEtBQUEsTUFBQSxFQUFBO0FBQ0EscUJBQUEsQ0FBQSxtQkFBQSxDQUFBLENBQUEsUUFBQSxDQUFBLGtCQUFBLENBQUEsQ0FBQTtpQkFDQSxNQUFBO0FBQ0EscUJBQUEsQ0FBQSxtQkFBQSxDQUFBLENBQUEsV0FBQSxDQUFBLGtCQUFBLENBQUEsQ0FBQTtpQkFDQTthQUNBLENBQUEsQ0FBQTs7O0FBR0EsYUFBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBLE1BQUEsQ0FBQSxZQUFBO0FBQ0Esb0JBQUEsQ0FBQSxDQUFBLFNBQUEsQ0FBQSxDQUFBLE1BQUEsRUFBQSxDQUFBLEdBQUEsR0FBQSxFQUFBLElBQUEsS0FBQSxDQUFBLElBQUEsRUFBQTtBQUNBLHFCQUFBLENBQUEsbUJBQUEsQ0FBQSxDQUFBLFFBQUEsQ0FBQSxrQkFBQSxDQUFBLENBQUE7aUJBQ0EsTUFBQTtBQUNBLHFCQUFBLENBQUEsbUJBQUEsQ0FBQSxDQUFBLFdBQUEsQ0FBQSxrQkFBQSxDQUFBLENBQUE7aUJBQ0E7YUFDQSxDQUFBLENBQUE7OztBQUdBLGFBQUEsQ0FBQSxZQUFBO0FBQ0EsaUJBQUEsQ0FBQSxnQkFBQSxDQUFBLENBQUEsSUFBQSxDQUFBLE9BQUEsRUFBQSxZQUFBO0FBQ0Esd0JBQUEsT0FBQSxHQUFBLENBQUEsQ0FBQSxJQUFBLENBQUEsQ0FBQTtBQUNBLHFCQUFBLENBQUEsWUFBQSxDQUFBLENBQUEsSUFBQSxFQUFBLENBQUEsT0FBQSxDQUFBO0FBQ0EsaUNBQUEsRUFBQSxDQUFBLENBQUEsT0FBQSxDQUFBLElBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQSxDQUFBLE1BQUEsRUFBQSxDQUFBLEdBQUE7cUJBQ0EsRUFBQSxJQUFBLEVBQUEsZUFBQSxDQUFBLENBQUE7QUFDQSx5QkFBQSxDQUFBLGNBQUEsRUFBQSxDQUFBO2lCQUNBLENBQUEsQ0FBQTthQUNBLENBQUEsQ0FBQTtTQUVBOztLQUVBLENBQUE7Q0FFQSxDQUFBLENBQUEiLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0JztcbndpbmRvdy5hcHAgPSBhbmd1bGFyLm1vZHVsZSgnR2VvUXVlc3QnLCBbJ2ZzYVByZUJ1aWx0JywgJ3VpLnJvdXRlcicsICd1aS5zb3J0YWJsZScsICd1aS5ib290c3RyYXAnLCAnbmdBbmltYXRlJywgJ2xlYWZsZXQtZGlyZWN0aXZlJ10pO1xuXG5hcHAuY29uZmlnKGZ1bmN0aW9uICgkdXJsUm91dGVyUHJvdmlkZXIsICRsb2NhdGlvblByb3ZpZGVyKSB7XG4gICAgLy8gVGhpcyB0dXJucyBvZmYgaGFzaGJhbmcgdXJscyAoLyNhYm91dCkgYW5kIGNoYW5nZXMgaXQgdG8gc29tZXRoaW5nIG5vcm1hbCAoL2Fib3V0KVxuICAgICRsb2NhdGlvblByb3ZpZGVyLmh0bWw1TW9kZSh0cnVlKTtcbiAgICAvLyBJZiB3ZSBnbyB0byBhIFVSTCB0aGF0IHVpLXJvdXRlciBkb2Vzbid0IGhhdmUgcmVnaXN0ZXJlZCwgZ28gdG8gdGhlIFwiL1wiIHVybC5cbiAgICAkdXJsUm91dGVyUHJvdmlkZXIub3RoZXJ3aXNlKCcvZGFzaGJvYXJkJyk7XG59KTtcblxuLy8gVGhpcyBhcHAucnVuIGlzIGZvciBjb250cm9sbGluZyBhY2Nlc3MgdG8gc3BlY2lmaWMgc3RhdGVzLlxuYXBwLnJ1bihmdW5jdGlvbiAoJHJvb3RTY29wZSwgQXV0aFNlcnZpY2UsICRzdGF0ZSkge1xuXG4gICAgLy8gVGhlIGdpdmVuIHN0YXRlIHJlcXVpcmVzIGFuIGF1dGhlbnRpY2F0ZWQgdXNlci5cbiAgICB2YXIgZGVzdGluYXRpb25TdGF0ZVJlcXVpcmVzQXV0aCA9IGZ1bmN0aW9uIChzdGF0ZSkge1xuICAgICAgICByZXR1cm4gc3RhdGUuZGF0YSAmJiBzdGF0ZS5kYXRhLmF1dGhlbnRpY2F0ZTtcbiAgICB9O1xuXG4gICAgLy8gJHN0YXRlQ2hhbmdlU3RhcnQgaXMgYW4gZXZlbnQgZmlyZWRcbiAgICAvLyB3aGVuZXZlciB0aGUgcHJvY2VzcyBvZiBjaGFuZ2luZyBhIHN0YXRlIGJlZ2lucy5cbiAgICAkcm9vdFNjb3BlLiRvbignJHN0YXRlQ2hhbmdlU3RhcnQnLCBmdW5jdGlvbiAoZXZlbnQsIHRvU3RhdGUsIHRvUGFyYW1zKSB7XG5cbiAgICAgICAgaWYgKCFkZXN0aW5hdGlvblN0YXRlUmVxdWlyZXNBdXRoKHRvU3RhdGUpKSB7XG4gICAgICAgICAgICAvLyBUaGUgZGVzdGluYXRpb24gc3RhdGUgZG9lcyBub3QgcmVxdWlyZSBhdXRoZW50aWNhdGlvblxuICAgICAgICAgICAgLy8gU2hvcnQgY2lyY3VpdCB3aXRoIHJldHVybi5cbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChBdXRoU2VydmljZS5pc0F1dGhlbnRpY2F0ZWQoKSkge1xuICAgICAgICAgICAgLy8gVGhlIHVzZXIgaXMgYXV0aGVudGljYXRlZC5cbiAgICAgICAgICAgIC8vIFNob3J0IGNpcmN1aXQgd2l0aCByZXR1cm4uXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDYW5jZWwgbmF2aWdhdGluZyB0byBuZXcgc3RhdGUuXG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cbiAgICAgICAgQXV0aFNlcnZpY2UuZ2V0TG9nZ2VkSW5Vc2VyKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgICAgICAgLy8gSWYgYSB1c2VyIGlzIHJldHJpZXZlZCwgdGhlbiByZW5hdmlnYXRlIHRvIHRoZSBkZXN0aW5hdGlvblxuICAgICAgICAgICAgLy8gKHRoZSBzZWNvbmQgdGltZSwgQXV0aFNlcnZpY2UuaXNBdXRoZW50aWNhdGVkKCkgd2lsbCB3b3JrKVxuICAgICAgICAgICAgLy8gb3RoZXJ3aXNlLCBpZiBubyB1c2VyIGlzIGxvZ2dlZCBpbiwgZ28gdG8gXCJsb2dpblwiIHN0YXRlLlxuICAgICAgICAgICAgaWYgKHVzZXIpIHtcbiAgICAgICAgICAgICAgICAkc3RhdGUuZ28odG9TdGF0ZS5uYW1lLCB0b1BhcmFtcyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICRzdGF0ZS5nbygnbG9naW4nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICB9KTtcblxufSk7XG4iLCJhcHAuY29uZmlnKGZ1bmN0aW9uICgkc3RhdGVQcm92aWRlcikge1xuXG4gICAgJHN0YXRlUHJvdmlkZXIuc3RhdGUoJ2hvbWUnLCB7XG4gICAgICAgIHVybDogJy8nLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2hvbWUvaG9tZS5odG1sJyxcbiAgICAgICAgY29udHJvbGxlcjogJ0hvbWVDdHJsJyxcbiAgICAgICAgcmVzb2x2ZToge1xuICAgICAgICAgICAgcmVxdWVzdGVkVXNlcjogZnVuY3Rpb24oQXV0aFNlcnZpY2UpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gQXV0aFNlcnZpY2UuZ2V0TG9nZ2VkSW5Vc2VyKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9KTtcblxufSk7XG5cbmFwcC5jb250cm9sbGVyKCdIb21lQ3RybCcsIGZ1bmN0aW9uICgkc2NvcGUsIEF1dGhTZXJ2aWNlLCAkc3RhdGUsIHJlcXVlc3RlZFVzZXIpIHtcbiAgICAvLyBJZiB0aGVyZSdzIGEgbG9nZ2VkIGluIHVzZXIgdXBvbiBsb2FkLCBnbyB0byB0aGUgZGFzaGJvYXJkXG4gICAgaWYgKHJlcXVlc3RlZFVzZXIpICRzdGF0ZS5nbygnZGFzaGJvYXJkJywge3VzZXJJZDogcmVxdWVzdGVkVXNlci5faWR9KTtcblxuICAgICRzY29wZS5ob21lID0gdHJ1ZTsgLy8gVG8ga25vdyB3aGF0IG5hdiBsaW5rcyB0byBzaG93XG4gICAgJHNjb3BlLmxvZ2luID0ge307XG4gICAgJHNjb3BlLnNpZ251cCA9IHt9O1xuICAgICRzY29wZS5sb2dpbkVycm9yID0gbnVsbDtcbiAgICAkc2NvcGUuc2lnbnVwRXJyb3IgPSBudWxsO1xuXG4gICAgJHNjb3BlLnNlbmRMb2dpbiA9IGZ1bmN0aW9uIChsb2dpbkluZm8pIHtcbiAgICAgICAgJHNjb3BlLmVycm9yID0gbnVsbDtcblxuICAgICAgICBBdXRoU2VydmljZS5sb2dpbihsb2dpbkluZm8pLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgICAgICRzdGF0ZS5nbygnZGFzaGJvYXJkJywge3VzZXJJZDogdXNlci5faWR9KTtcbiAgICAgICAgfSkuY2F0Y2goZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgJHNjb3BlLmVycm9yID0gXCJJIHRoaW5rIHlvdVxcJ3ZlIGVudGVyZWQgdGhlIHdyb25nIGluZm8sIGZyaWVuZFwiO1xuICAgICAgICB9KTtcblxuICAgIH07XG5cbiAgICAkc2NvcGUuc2VuZFNpZ251cCA9IGZ1bmN0aW9uKHNpZ251cEluZm8pIHtcbiAgICAgICAgJHNjb3BlLmVycm9yID0gbnVsbDtcbiAgICAgICAgQXV0aFNlcnZpY2Uuc2lnbnVwKHNpZ251cEluZm8pLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgICAgICRzdGF0ZS5nbygnZGFzaGJvYXJkJywge3VzZXJJZDogdXNlci5faWR9LCB7cmVsb2FkOiB0cnVlfSk7XG4gICAgICAgIH0pLmNhdGNoKGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICAkc2NvcGUuZXJyb3IgPSBcIkknbSBhZnJhaWQgd2UgYWxyZWFkeSBoYXZlIHNvbWVvbmUgYnkgdGhhdCBuYW1lXCI7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICAvLyBQYXJhbGF4IGVmZmVjdCBmb3IgaW1hZ2VzXG4gICAgJChmdW5jdGlvbigpIHtcbiAgICAvLyBDYWNoZSB0aGUgd2luZG93IG9iamVjdCAobWFrZXMgbG9hZCB0aW1lIGZhc3RlcilcbiAgICB2YXIgJHdpbmRvdyA9ICQod2luZG93KTtcbiAgICAvLyBQYXJhbGxheCBiYWNrZ3JvdW5kIGVmZmVjdFxuICAgICQoJ3NlY3Rpb25bZGF0YS10eXBlPVwiYmFja2dyb3VuZFwiXScpLmVhY2goZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciAkYmdvYmogPSAkKHRoaXMpOyAvLyBhc3NpZ25pbmcgdGhlIG9iamVjdFxuICAgICAgICAkKHdpbmRvdykuc2Nyb2xsKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgLy9zY3JvbGwgdGhlIGJhY2tncm91bmQgYXQgdmFyIHNwZWVkXG4gICAgICAgICAgICAvLyB0aGUgeVBvcyBpcyBhIG5lZ2F0aXZlIGJlY2F1c2Ugd2UncmUgc2Nyb2xsaW5nIGl0IHVwXG4gICAgICAgICAgICB2YXIgeVBvcyA9IC0oJHdpbmRvdy5zY3JvbGxUb3AoKSAvICRiZ29iai5kYXRhKCdzcGVlZCcpKTtcbiAgICAgICAgICAgIC8vIFB1dCB0b2dldGhlciBvdXIgZmluYWwgYmFja2dyb3VuZCBwb3NpdGlvblxuICAgICAgICAgICAgdmFyIGNvb3JkcyA9ICc1MCUgJyArIHlQb3MgKyAncHgnO1xuICAgICAgICAgICAgLy8gTW92ZSB0aGUgYmFja2dyb3VuZFxuICAgICAgICAgICAgJGJnb2JqLmNzcyh7IGJhY2tncm91bmRQb3NpdGlvbjogY29vcmRzIH0pO1xuICAgICAgICB9KTsgLy8gZW5kIHdpbmRvdyBzY3JvbGxcbiAgICB9KTtcbn0pO1xuXG5cblxufSk7IiwiYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHN0YXRlUHJvdmlkZXIpe1xuXHQkc3RhdGVQcm92aWRlci5zdGF0ZSgnZWRpdG9yJyxcblx0XHR7XG5cdFx0XHR1cmw6ICcvZWRpdG9yLzppZCcsXG5cdFx0XHR0ZW1wbGF0ZVVybDogJ2pzL3F1ZXN0LWVkaXRvci9lZGl0b3IuaHRtbCcsXG5cdFx0XHRjb250cm9sbGVyOiAnRWRpdG9yQ3RybCcsXG5cdFx0ICAgIHJlc29sdmU6IHtcblx0XHQgICAgXHRxdWVzdDogZnVuY3Rpb24oUXVlc3RGYWN0b3J5LCAkc3RhdGVQYXJhbXMpe1xuXHRcdCAgICBcdFx0cmV0dXJuICRzdGF0ZVBhcmFtcy5pZCAhPT0gXCJcIiA/XG5cdFx0XHRcdFx0XHRRdWVzdEZhY3RvcnkuZ2V0T25lUXVlc3QoJHN0YXRlUGFyYW1zLmlkKSA6IFxuXHRcdFx0XHRcdFx0dW5kZWZpbmVkO1xuXHRcdCAgICBcdH1cblx0XHQgICAgfSxcblx0XHRcdGRhdGE6IHtcblx0ICAgICAgICBhdXRoZW50aWNhdGU6IHRydWVcblx0ICAgIH1cblx0fSk7XG59KTtcblxuYXBwLmNvbnRyb2xsZXIoJ0VkaXRvckN0cmwnLCBmdW5jdGlvbiAoJHNjb3BlLCAkc3RhdGVQYXJhbXMsICR1aWJNb2RhbCwgJHN0YXRlLCAkcm9vdFNjb3BlLCBxdWVzdCwgU2Vzc2lvbiwgUXVlc3RGYWN0b3J5KSB7XG5cdC8vdmFyaWFibGUgc2F2ZWQgdG8gc2hvdy9oaWRlIHF1ZXN0IGVkaXRvciB3aGVuIGVkaXRpbmcgaW5kaXZpZHVhbCBzdGF0ZXNcblx0JHJvb3RTY29wZS5lZGl0b3JWaXNpYmxlID0gdHJ1ZTtcblx0JHNjb3BlLnF1ZXN0ID0gcXVlc3Q7XG5cdCRzY29wZS52aWV3TWFpbk1hcCA9IHRydWU7XG5cdCRzY29wZS5uZXdRdWVzdCA9IGZhbHNlO1xuXHQvL2lmIHRoZXJlIGlzIG5vIG5ldyBxdWVzdCwgc2V0IHByb3BlcnRpZXMgXG5cdGlmKCFxdWVzdCkge1xuXHRcdCRzY29wZS5uZXdRdWVzdCA9IHRydWU7XG5cdFx0JHNjb3BlLnF1ZXN0PSB7XG5cdFx0XHRzdGFydDogIFs0MC43MjMwMDgsLTc0LjAwMDYzMjddXG5cdFx0fTtcblx0fVxuXHQvL3VwZGF0ZSBxdWVzdCBhbmQgZ28gdG8gZGFzaGJvYXJkIGZvciBjdXJyZW50IHVzZXJcblx0JHNjb3BlLnNhdmVRdWVzdCA9IGZ1bmN0aW9uICgpIHtcblx0XHRpZighJHNjb3BlLm5ld1F1ZXN0KSB7XG5cdFx0XHRyZXR1cm4gUXVlc3RGYWN0b3J5LnNhdmUoJHNjb3BlLnF1ZXN0KVx0XHRcblx0XHRcdC50aGVuKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0JHN0YXRlLmdvKCdkYXNoYm9hcmQnLCB7dXNlcklkOiBTZXNzaW9uLnVzZXIuX2lkfSk7XG5cdFx0XHR9KVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gUXVlc3RGYWN0b3J5LnNhdmVOZXcoJHNjb3BlLnF1ZXN0KVxuXHRcdFx0LnRoZW4oZnVuY3Rpb24gKCkge1xuXHRcdFx0XHQkc3RhdGUuZ28oJ2Rhc2hib2FyZCcsIHt1c2VySWQ6IFNlc3Npb24udXNlci5faWR9KTtcblx0XHRcdH0pXG5cdFx0fVxuXHR9O1xuXHQvL2dvIHRvIG1hcFN0YXRlcyBlZGl0b3IgYW5kIGhpZGUgUXVlc3QgZWRpdG9yIFxuXHQkc2NvcGUudHJhbnNpdGlvblRvTWFwU3RhdGVFZGl0b3IgPSBmdW5jdGlvbiAoKSB7XG5cdFx0aWYoISRzY29wZS5uZXdRdWVzdCkge1xuXHRcdFx0cmV0dXJuIFF1ZXN0RmFjdG9yeS5zYXZlKCRzY29wZS5xdWVzdClcblx0XHRcdC50aGVuKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0aWYoJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0JHN0YXRlLmdvKCdlZGl0b3IucXVlc3RTdGVwJywge3F1ZXN0U3RlcElkOiBudWxsfSk7XG5cdFx0XHRcdH0gZWxzZSB7IFxuXHRcdFx0XHRcdCRzdGF0ZS5nbygnZWRpdG9yLnF1ZXN0U3RlcCcsIHtxdWVzdFN0ZXBJZDogJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHNbMF0uX2lkfSk7XHRcblx0XHRcdFx0fVxuXHRcdFx0XHQkc2NvcGUuZWRpdG9yVmlzaWJsZSA9IGZhbHNlO1xuXHRcdFx0fSlcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIFF1ZXN0RmFjdG9yeS5zYXZlTmV3KCRzY29wZS5xdWVzdClcblx0XHRcdC50aGVuKGZ1bmN0aW9uIChzYXZlZFF1ZXN0KSB7XG5cdFx0XHRcdCRzY29wZS5lZGl0b3JWaXNpYmxlID0gZmFsc2U7XG5cdFx0XHRcdCRzdGF0ZS5nbygnZWRpdG9yLnF1ZXN0U3RlcCcsIHtpZDogc2F2ZWRRdWVzdC5faWQsIHF1ZXN0U3RlcElkOiBudWxsfSk7XG5cdFx0XHR9KVxuXHRcdH1cblx0fTtcblxuXHQvLyoqKioqKioqKioqICBNQVAgRlVOQ1RJT05TIEJFTE9XICAqKioqKioqKioqKioqKioqKioqKioqKlxuXHRcdHZhciBxdWVzdE1hcCA9IEwubWFwKCdxdWVzdC1tYXAnKS5zZXRWaWV3KCRzY29wZS5xdWVzdC5zdGFydCwgMTMpO1xuXG5cdFx0TC50aWxlTGF5ZXIoJ2h0dHBzOi8vYXBpLnRpbGVzLm1hcGJveC5jb20vdjQve2lkfS97en0ve3h9L3t5fS5wbmc/YWNjZXNzX3Rva2VuPXthY2Nlc3NUb2tlbn0nLCB7XG5cdCAgICBtYXhab29tOiAxOCxcblx0ICAgIGlkOiAnc2NvdHRlZ2dzLm83NjE0amwyJyxcblx0ICAgIGFjY2Vzc1Rva2VuOiAncGsuZXlKMUlqb2ljMk52ZEhSbFoyZHpJaXdpWVNJNkltTnBhRFpvWnpobWRqQmpNRFoxY1dvNWFHY3lhWGx0ZVRraWZRLkxaZTAtSUJSUW1aMFBrUUJzWUlsaXcnXG5cdFx0fSkuYWRkVG8ocXVlc3RNYXApO1xuXG5cdFx0dmFyIGRyYXduSXRlbXMgPSBuZXcgTC5GZWF0dXJlR3JvdXAoKTtcblx0XHRxdWVzdE1hcC5hZGRMYXllcihkcmF3bkl0ZW1zKTtcdFxuXG5cdFx0Ly8gSW5pdGlhbGlzZSB0aGUgZHJhdyBjb250cm9sIGFuZCBwYXNzIGl0IHRoZSBGZWF0dXJlR3JvdXAgb2YgZWRpdGFibGUgbGF5ZXJzXG5cdFx0dmFyIGRyYXdDb250cm9sID0gbmV3IEwuQ29udHJvbC5EcmF3KHtcblx0XHQgICAgZHJhdzoge1xuXHRcdCAgICBcdHBvbHlsaW5lOiBmYWxzZSxcblx0XHQgICAgXHRwb2x5Z29uOiBmYWxzZSxcblx0XHQgICAgXHRyZWN0YW5nbGU6IGZhbHNlLFxuXHRcdCAgICBcdGNpcmNsZTogZmFsc2Vcblx0XHQgICAgfSxcblx0XHQgICAgZWRpdDoge1xuXHRcdCAgICAgICAgZmVhdHVyZUdyb3VwOiBkcmF3bkl0ZW1zXG5cdFx0ICAgIH1cblx0XHR9KTtcblxuXHRcdHF1ZXN0TWFwLmFkZENvbnRyb2woZHJhd0NvbnRyb2wpO1xuXG5cdFx0dmFyIG1hcmtlciA9IEwubWFya2VyKCRzY29wZS5xdWVzdC5zdGFydCwge2RyYWdnYWJsZTogdHJ1ZX0pO1xuXHRcdHF1ZXN0TWFwLmFkZExheWVyKG1hcmtlcik7XG5cblx0XHRxdWVzdE1hcC5vbignZHJhdzpjcmVhdGVkJywgZnVuY3Rpb24gKGUpIHtcblx0XHRcdC8vXHRyZW1vdmUgYW55IGV4aXN0aW5nIG1hcmtlcnNcblx0XHQgIGlmIChtYXJrZXIpIHF1ZXN0TWFwLnJlbW92ZUxheWVyKG1hcmtlcik7XG5cdFx0ICB2YXIgdHlwZSA9IGUubGF5ZXJUeXBlO1xuXHRcdCAgdmFyIGxheWVyID0gZS5sYXllcjtcblx0XHQgIC8vc2F2ZSBzdGFydCBsb2NhdGlvbiBvZiBuZXcgbWFya2VyXG5cdFx0ICAkc2NvcGUucXVlc3Quc3RhcnQgPSBbbGF5ZXIuX2xhdGxuZy5sYXQsbGF5ZXIuX2xhdGxuZy5sbmddO1xuXHRcdCAgLy9jcmVhdGUgbWFya2VyIGFuZCBhZGQgdG8gbWFwXG5cdFx0ICBtYXJrZXIgPSBMLm1hcmtlcihbbGF5ZXIuX2xhdGxuZy5sYXQsbGF5ZXIuX2xhdGxuZy5sbmddLCB7ZHJhZ2dhYmxlOiB0cnVlfSk7XG5cdFx0ICBxdWVzdE1hcC5hZGRMYXllcihtYXJrZXIpO1xuXHRcdH0pO1xuXG5cdFx0bWFya2VyLm9uKCdkcmFnZW5kJywgZnVuY3Rpb24gKGUpIHtcblx0XHRcdCRzY29wZS5xdWVzdC5zdGFydCA9IFtlLnRhcmdldC5fbGF0bG5nLmxhdCxlLnRhcmdldC5fbGF0bG5nLmxuZ107XG5cdFx0fSlcblxuXHRcdGlmICgkc2NvcGUubmV3UXVlc3QpIHtcblx0XHRcdHF1ZXN0TWFwLmxvY2F0ZSgpLm9uKCdsb2NhdGlvbmZvdW5kJywgZnVuY3Rpb24gKGUpIHtcblx0XHRcdFx0cXVlc3RNYXAuc2V0VmlldyhbZS5sYXRpdHVkZSxlLmxvbmdpdHVkZV0sIDE0KTtcblx0XHRcdFx0bWFya2VyLnNldExhdExuZyhbZS5sYXRpdHVkZSxlLmxvbmdpdHVkZV0pO1xuXHRcdFx0XHQkc2NvcGUucXVlc3Quc3RhcnQgPSBbZS5sYXRpdHVkZSxlLmxvbmdpdHVkZV07XG5cdFx0XHR9KTtcblx0XHR9XG5cbn0pIiwiKGZ1bmN0aW9uICgpIHtcblxuICAgICd1c2Ugc3RyaWN0JztcblxuICAgIC8vIEhvcGUgeW91IGRpZG4ndCBmb3JnZXQgQW5ndWxhciEgRHVoLWRveS5cbiAgICBpZiAoIXdpbmRvdy5hbmd1bGFyKSB0aHJvdyBuZXcgRXJyb3IoJ0kgY2FuXFwndCBmaW5kIEFuZ3VsYXIhJyk7XG5cbiAgICB2YXIgYXBwID0gYW5ndWxhci5tb2R1bGUoJ2ZzYVByZUJ1aWx0JywgW10pO1xuXG4gICAgYXBwLmZhY3RvcnkoJ1NvY2tldCcsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKCF3aW5kb3cuaW8pIHRocm93IG5ldyBFcnJvcignc29ja2V0LmlvIG5vdCBmb3VuZCEnKTtcbiAgICAgICAgcmV0dXJuIHdpbmRvdy5pbyh3aW5kb3cubG9jYXRpb24ub3JpZ2luKTtcbiAgICB9KTtcblxuICAgIC8vIEFVVEhfRVZFTlRTIGlzIHVzZWQgdGhyb3VnaG91dCBvdXIgYXBwIHRvXG4gICAgLy8gYnJvYWRjYXN0IGFuZCBsaXN0ZW4gZnJvbSBhbmQgdG8gdGhlICRyb290U2NvcGVcbiAgICAvLyBmb3IgaW1wb3J0YW50IGV2ZW50cyBhYm91dCBhdXRoZW50aWNhdGlvbiBmbG93LlxuICAgIGFwcC5jb25zdGFudCgnQVVUSF9FVkVOVFMnLCB7XG4gICAgICAgIGxvZ2luU3VjY2VzczogJ2F1dGgtbG9naW4tc3VjY2VzcycsXG4gICAgICAgIGxvZ2luRmFpbGVkOiAnYXV0aC1sb2dpbi1mYWlsZWQnLFxuICAgICAgICBsb2dvdXRTdWNjZXNzOiAnYXV0aC1sb2dvdXQtc3VjY2VzcycsXG4gICAgICAgIHNlc3Npb25UaW1lb3V0OiAnYXV0aC1zZXNzaW9uLXRpbWVvdXQnLFxuICAgICAgICBub3RBdXRoZW50aWNhdGVkOiAnYXV0aC1ub3QtYXV0aGVudGljYXRlZCcsXG4gICAgICAgIG5vdEF1dGhvcml6ZWQ6ICdhdXRoLW5vdC1hdXRob3JpemVkJ1xuICAgIH0pO1xuXG4gICAgYXBwLmZhY3RvcnkoJ0F1dGhJbnRlcmNlcHRvcicsIGZ1bmN0aW9uICgkcm9vdFNjb3BlLCAkcSwgQVVUSF9FVkVOVFMpIHtcbiAgICAgICAgdmFyIHN0YXR1c0RpY3QgPSB7XG4gICAgICAgICAgICA0MDE6IEFVVEhfRVZFTlRTLm5vdEF1dGhlbnRpY2F0ZWQsXG4gICAgICAgICAgICA0MDM6IEFVVEhfRVZFTlRTLm5vdEF1dGhvcml6ZWQsXG4gICAgICAgICAgICA0MTk6IEFVVEhfRVZFTlRTLnNlc3Npb25UaW1lb3V0LFxuICAgICAgICAgICAgNDQwOiBBVVRIX0VWRU5UUy5zZXNzaW9uVGltZW91dFxuICAgICAgICB9O1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgcmVzcG9uc2VFcnJvcjogZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KHN0YXR1c0RpY3RbcmVzcG9uc2Uuc3RhdHVzXSwgcmVzcG9uc2UpO1xuICAgICAgICAgICAgICAgIHJldHVybiAkcS5yZWplY3QocmVzcG9uc2UpXG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgfSk7XG5cbiAgICBhcHAuY29uZmlnKGZ1bmN0aW9uICgkaHR0cFByb3ZpZGVyKSB7XG4gICAgICAgICRodHRwUHJvdmlkZXIuaW50ZXJjZXB0b3JzLnB1c2goW1xuICAgICAgICAgICAgJyRpbmplY3RvcicsXG4gICAgICAgICAgICBmdW5jdGlvbiAoJGluamVjdG9yKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICRpbmplY3Rvci5nZXQoJ0F1dGhJbnRlcmNlcHRvcicpO1xuICAgICAgICAgICAgfVxuICAgICAgICBdKTtcbiAgICB9KTtcbiAgICBhcHAuc2VydmljZSgnQXV0aFNlcnZpY2UnLCBmdW5jdGlvbiAoJGh0dHAsIFNlc3Npb24sICRyb290U2NvcGUsIEFVVEhfRVZFTlRTLCAkcSkge1xuXG4gICAgICAgIGZ1bmN0aW9uIG9uU3VjY2Vzc2Z1bExvZ2luKHJlc3BvbnNlKSB7XG4gICAgICAgICAgICB2YXIgZGF0YSA9IHJlc3BvbnNlLmRhdGE7XG4gICAgICAgICAgICBTZXNzaW9uLmNyZWF0ZShkYXRhLmlkLCBkYXRhLnVzZXIpO1xuICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KEFVVEhfRVZFTlRTLmxvZ2luU3VjY2Vzcyk7XG4gICAgICAgICAgICByZXR1cm4gZGF0YS51c2VyO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gVXNlcyB0aGUgc2Vzc2lvbiBmYWN0b3J5IHRvIHNlZSBpZiBhblxuICAgICAgICAvLyBhdXRoZW50aWNhdGVkIHVzZXIgaXMgY3VycmVudGx5IHJlZ2lzdGVyZWQuXG4gICAgICAgIHRoaXMuaXNBdXRoZW50aWNhdGVkID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuICEhU2Vzc2lvbi51c2VyO1xuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMuZ2V0TG9nZ2VkSW5Vc2VyID0gZnVuY3Rpb24gKGZyb21TZXJ2ZXIpIHtcblxuICAgICAgICAgICAgLy8gSWYgYW4gYXV0aGVudGljYXRlZCBzZXNzaW9uIGV4aXN0cywgd2VcbiAgICAgICAgICAgIC8vIHJldHVybiB0aGUgdXNlciBhdHRhY2hlZCB0byB0aGF0IHNlc3Npb25cbiAgICAgICAgICAgIC8vIHdpdGggYSBwcm9taXNlLiBUaGlzIGVuc3VyZXMgdGhhdCB3ZSBjYW5cbiAgICAgICAgICAgIC8vIGFsd2F5cyBpbnRlcmZhY2Ugd2l0aCB0aGlzIG1ldGhvZCBhc3luY2hyb25vdXNseS5cblxuICAgICAgICAgICAgLy8gT3B0aW9uYWxseSwgaWYgdHJ1ZSBpcyBnaXZlbiBhcyB0aGUgZnJvbVNlcnZlciBwYXJhbWV0ZXIsXG4gICAgICAgICAgICAvLyB0aGVuIHRoaXMgY2FjaGVkIHZhbHVlIHdpbGwgbm90IGJlIHVzZWQuXG5cbiAgICAgICAgICAgIGlmICh0aGlzLmlzQXV0aGVudGljYXRlZCgpICYmIGZyb21TZXJ2ZXIgIT09IHRydWUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gJHEud2hlbihTZXNzaW9uLnVzZXIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBNYWtlIHJlcXVlc3QgR0VUIC9zZXNzaW9uLlxuICAgICAgICAgICAgLy8gSWYgaXQgcmV0dXJucyBhIHVzZXIsIGNhbGwgb25TdWNjZXNzZnVsTG9naW4gd2l0aCB0aGUgcmVzcG9uc2UuXG4gICAgICAgICAgICAvLyBJZiBpdCByZXR1cm5zIGEgNDAxIHJlc3BvbnNlLCB3ZSBjYXRjaCBpdCBhbmQgaW5zdGVhZCByZXNvbHZlIHRvIG51bGwuXG4gICAgICAgICAgICByZXR1cm4gJGh0dHAuZ2V0KCcvc2Vzc2lvbicpLnRoZW4ob25TdWNjZXNzZnVsTG9naW4pLmNhdGNoKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5sb2dpbiA9IGZ1bmN0aW9uIChjcmVkZW50aWFscykge1xuICAgICAgICAgICAgcmV0dXJuICRodHRwLnBvc3QoJy9sb2dpbicsIGNyZWRlbnRpYWxzKVxuICAgICAgICAgICAgICAgIC50aGVuKG9uU3VjY2Vzc2Z1bExvZ2luKVxuICAgICAgICAgICAgICAgIC5jYXRjaChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAkcS5yZWplY3QoeyBtZXNzYWdlOiAnSW52YWxpZCBsb2dpbiBjcmVkZW50aWFscy4nIH0pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuICAgICAgICBcblxuICAgICAgICB0aGlzLnNpZ251cCA9IGZ1bmN0aW9uIChjcmVkZW50aWFscykge1xuICAgICAgICAgICAgLy9zZW5kcyBhIHBvc3QgcmVxdWVzdCBjb250YWluaW5nIHRoZSB1c2VyJ3MgY3JlZGVudGlhbHMgdG8gXG4gICAgICAgICAgICByZXR1cm4gJGh0dHAucG9zdCgnYXBpL3VzZXJzL3NpZ251cCcsIGNyZWRlbnRpYWxzKVxuICAgICAgICAgICAgICAgIC8vb25jZSB0aGUgdXNlciBoYXMgYmVlbiBjcmVhdGVkIG9uIHRoZSBiYWNrZW5kLi4uXG4gICAgICAgICAgICAgICAgLnRoZW4oZnVuY3Rpb24ocmVzcG9uc2UpIHtcbiAgICAgICAgICAgICAgICAgICAgLy9hIHNlY29uZCBwb3N0IHJlcXVlc3QgaXMgY3JlYXRlZCB0byBsb2cgdGhlIHVzZXIgaW5cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICRodHRwLnBvc3QoJy9sb2dpbicsIGNyZWRlbnRpYWxzKTtcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIC50aGVuKG9uU3VjY2Vzc2Z1bExvZ2luKVxuICAgICAgICAgICAgICAgIC5jYXRjaChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAkcS5yZWplY3QoeyBtZXNzYWdlOiAnSW52YWxpZCBzaWdudXAgY3JlZGVudGlhbHMuJyB9KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLmxvZ291dCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiAkaHR0cC5nZXQoJy9sb2dvdXQnKS50aGVuKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBTZXNzaW9uLmRlc3Ryb3koKTtcbiAgICAgICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoQVVUSF9FVkVOVFMubG9nb3V0U3VjY2Vzcyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfTtcblxuICAgIH0pO1xuXG4gICAgYXBwLnNlcnZpY2UoJ1Nlc3Npb24nLCBmdW5jdGlvbiAoJHJvb3RTY29wZSwgQVVUSF9FVkVOVFMpIHtcblxuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICAgICAgJHJvb3RTY29wZS4kb24oQVVUSF9FVkVOVFMubm90QXV0aGVudGljYXRlZCwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgc2VsZi5kZXN0cm95KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgICRyb290U2NvcGUuJG9uKEFVVEhfRVZFTlRTLnNlc3Npb25UaW1lb3V0LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBzZWxmLmRlc3Ryb3koKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy5pZCA9IG51bGw7XG4gICAgICAgIHRoaXMudXNlciA9IG51bGw7XG5cbiAgICAgICAgdGhpcy5jcmVhdGUgPSBmdW5jdGlvbiAoc2Vzc2lvbklkLCB1c2VyKSB7XG4gICAgICAgICAgICB0aGlzLmlkID0gc2Vzc2lvbklkO1xuICAgICAgICAgICAgdGhpcy51c2VyID0gdXNlcjtcbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLmRlc3Ryb3kgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLmlkID0gbnVsbDtcbiAgICAgICAgICAgIHRoaXMudXNlciA9IG51bGw7XG4gICAgICAgIH07XG5cbiAgICB9KTtcblxufSkoKTtcbiIsImFwcC5jb25maWcoZnVuY3Rpb24gKCRzdGF0ZVByb3ZpZGVyKSB7XG4kc3RhdGVQcm92aWRlci5zdGF0ZSgnZWRpdG9yLnF1ZXN0U3RlcCcsIHtcblx0XHR1cmw6ICcvcXVlc3RzdGVwLzpxdWVzdFN0ZXBJZCcsIFxuXHRcdHRlbXBsYXRlVXJsOiAnanMvcXVlc3Qtc3RlcC1lZGl0b3IvcXVlc3Qtc3RlcC1lZGl0b3IuaHRtbCcsXG5cdFx0Y29udHJvbGxlcjogJ1F1ZXN0U3RlcEVkaXRDdHJsJyxcblx0XHRyZXNvbHZlOiB7XG5cdFx0XHRxdWVzdDogZnVuY3Rpb24oUXVlc3RGYWN0b3J5LCAkc3RhdGVQYXJhbXMpe1xuICAgIFx0XHRyZXR1cm4gJHN0YXRlUGFyYW1zLmlkICE9PSBcIlwiID9cblx0XHRcdFx0XHRRdWVzdEZhY3RvcnkuZ2V0T25lUXVlc3QoJHN0YXRlUGFyYW1zLmlkKSA6IFxuXHRcdFx0XHRcdHVuZGVmaW5lZDtcbiAgICBcdFx0fVxuXHRcdH0sXG5cdFx0ZGF0YToge1xuICAgICAgXHRcdGF1dGhlbnRpY2F0ZTogdHJ1ZVxuICAgIFx0fVxuXHR9KTtcbn0pO1xuXG5cbmFwcC5jb250cm9sbGVyKCdRdWVzdFN0ZXBFZGl0Q3RybCcsIGZ1bmN0aW9uICgkc3RhdGVQYXJhbXMsICRzY29wZSwgJHN0YXRlLCAkcm9vdFNjb3BlLCBxdWVzdCwgUXVlc3RGYWN0b3J5KXtcblx0JHNjb3BlLnF1ZXN0ID0gcXVlc3Q7XG5cdCRyb290U2NvcGUuZWRpdG9yVmlzaWJsZSA9IGZhbHNlO1xuXHQkc2NvcGUudmlld01hcCA9IHRydWU7XG5cblx0Ly9kZWZpbmQgbmV3IFN0ZXAgZm9yIGFkZGluZyB0byBzdGVwcyBhcnJheVxuXHQkc2NvcGUubmV3U3RlcCA9IHtcblx0XHRuYW1lOiAnTmV3IFN0ZXAnLFxuXHRcdHRhcmdldENpcmNsZToge1xuXHRcdFx0XHRjZW50ZXI6IFtdLFxuXHRcdFx0XHRyYWRpdXM6IG51bGxcblx0XHRcdH1cblx0XHR9XHRcblx0Ly9pZiB3ZSBoYXZlIHN0ZXBzLCBmaW5kIHRoZSBpbmRleCBvZiB0aGUgc3RlcCB0aGF0IG1hdGNoZXMgdGhlIHBhcmFtc1xuXHRpZigkc2NvcGUucXVlc3QucXVlc3RTdGVwcy5sZW5ndGggPiAwKSB7XG5cdFx0JHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMuZm9yRWFjaCggZnVuY3Rpb24gKHN0ZXAsIGluZGV4KSB7XG5cdFx0XHRpZiAoc3RlcC5faWQgPT09ICRzdGF0ZVBhcmFtcy5xdWVzdFN0ZXBJZCkge1xuXHRcdFx0XHQkc2NvcGUucXVlc3QuaWR4ID0gaW5kZXg7XG5cdFx0XHR9XG5cdFx0fSlcblx0XHQvL3NldHMgY3VycmVudFN0ZXAgdG8gdGhhdCBtYXRjaGluZyB0aGUgcGFyYW1ldGVyc1xuXHRcdCRzY29wZS5jdXJyZW50U3RlcCA9ICRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzWyRzY29wZS5xdWVzdC5pZHhdO1xuXHR9IGVsc2Uge1xuXHRcdCRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzLnB1c2goJHNjb3BlLm5ld1N0ZXApO1xuXHRcdCRzY29wZS5jdXJyZW50U3RlcCA9ICRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzWzBdXG5cdH1cblx0Ly9mdW5jdGlvbiB0byBzd2l0Y2ggc3RhdGVzIHdpdGhpbiBtYXBTdGF0ZSBlZGl0b3Jcblx0JHNjb3BlLnN3aXRjaFN0ZXAgPSBmdW5jdGlvbiAoY2xpY2tlZFN0ZXApIHtcblx0XHRRdWVzdEZhY3Rvcnkuc2F2ZSgkc2NvcGUucXVlc3QpXG5cdFx0LnRoZW4oZnVuY3Rpb24gKCkge1xuXHRcdC8vIHJlZGlyZWN0IHRvIHRoZSBjbGlja2VkIG1hcHN0YXRlXG5cdFx0XHQkc3RhdGUuZ28oJ2VkaXRvci5xdWVzdFN0ZXAnLCB7cXVlc3RTdGVwSWQ6IGNsaWNrZWRTdGVwLl9pZH0pO1x0XG5cdFx0fSlcblx0fTtcblx0JHNjb3BlLnNhdmVRdWVzdFN0ZXBzID0gZnVuY3Rpb24gKCkge1xuXHQvL3VwZGF0ZXMgY3VycmVudCBtYXBTdGF0ZVxuXHRcdFF1ZXN0RmFjdG9yeS5zYXZlKCRzY29wZS5xdWVzdClcblx0XHQudGhlbihmdW5jdGlvbiAodXBkYXRlZFF1ZXN0KSB7XG5cdFx0XHQkc2NvcGUucXVlc3QgPSB1cGRhdGVkUXVlc3Q7XG5cdFx0XHQkc3RhdGUuZ28oJ2VkaXRvcicsIHtpZDogJHNjb3BlLnF1ZXN0Ll9pZH0sIHtyZWxvYWQ6IHRydWV9KTtcdFxuXHRcdH0pXG5cdH07XG5cdCRzY29wZS5yZXR1cm5XaXRob3V0U2F2aW5nID0gZnVuY3Rpb24gKCkge1xuXHRcdFx0JHN0YXRlLmdvKCdlZGl0b3InLCB7aWQ6ICRzY29wZS5xdWVzdC5faWR9LCB7cmVsb2FkOiB0cnVlfSk7XHRcblx0fTtcblx0JHNjb3BlLmFkZFF1ZXN0U3RlcCA9IGZ1bmN0aW9uICgpIHtcblx0XHQkc2NvcGUucXVlc3QucXVlc3RTdGVwcy5wdXNoKCRzY29wZS5uZXdTdGVwKTtcblx0XHRyZXR1cm4gUXVlc3RGYWN0b3J5LnNhdmUoJHNjb3BlLnF1ZXN0KVxuXHRcdC50aGVuKCBmdW5jdGlvbiAodXBkYXRlZFF1ZXN0KSB7XG5cdFx0XHQkc2NvcGUucXVlc3QgPSB1cGRhdGVkUXVlc3Q7XG5cdFx0XHQkc3RhdGUuZ28oJ2VkaXRvci5xdWVzdFN0ZXAnLCB7cXVlc3RTdGVwSWQ6ICRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzWyRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzLmxlbmd0aC0xXS5faWR9KTtcblx0XHR9KVxuXG5cdH07XG5cdCRzY29wZS5yZW1vdmVRdWVzdFN0ZXAgPSBmdW5jdGlvbiAoKSB7XG5cdFx0dmFyIGluZGV4ID0gJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMuaW5kZXhPZigkc2NvcGUuY3VycmVudFN0ZXApO1xuXHRcdCRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzLnNwbGljZShpbmRleCwgMSk7XG5cdFx0aWYgKGluZGV4ID09PSAkc2NvcGUucXVlc3QucXVlc3RTdGVwcy5sZW5ndGgpIGluZGV4LS07XG5cdFx0cmV0dXJuIFF1ZXN0RmFjdG9yeS5zYXZlKCRzY29wZS5xdWVzdClcblx0XHQudGhlbiggZnVuY3Rpb24gKHVwZGF0ZWRRdWVzdCkge1xuXHRcdFx0JHNjb3BlLnF1ZXN0ID0gdXBkYXRlZFF1ZXN0O1xuXHRcdFx0dmFyIHN0ZXBEZXN0aW5hdGlvbiA9ICRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzLmxlbmd0aD09PTAgPyBudWxsIDogJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHNbaW5kZXhdLl9pZDtcblx0XHRcdCRzdGF0ZS5nbygnZWRpdG9yLnF1ZXN0U3RlcCcsIHtxdWVzdFN0ZXBJZDogc3RlcERlc3RpbmF0aW9ufSwge3JlbG9hZDogdHJ1ZX0pO1xuXHRcdH0pXG5cdH07XG5cblx0Ly8gLy9mdW5jdGlvbiB0byBzZXQgbWFwIHRvIGVpdGhlciB0YXJnZXQgcmVnaW9uIG9yIG1hcCBzdGFydGluZyBwb2ludCBpZiBubyB0YXJnZXQgcmVnaW9uXG5cdHZhciBtYXBWaWV3ID0gZnVuY3Rpb24gKCkge1xuXG5cdFx0aWYgKCRzY29wZS5jdXJyZW50U3RlcC50YXJnZXRDaXJjbGUuY2VudGVyLmxlbmd0aCA9PT0gMikge1xuXHRcdFx0cmV0dXJuKCRzY29wZS5jdXJyZW50U3RlcC50YXJnZXRDaXJjbGUuY2VudGVyKVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gJHNjb3BlLnF1ZXN0LnN0YXJ0XG5cdFx0fVxuXHR9O1xuXHQvLyAvL2luaXRpYWxpemUgbWFwIGFuZCBzZXQgdmlldyB1c2luZyBtYXBWaWV3IGZ1bmN0aW9uXG5cdHZhciBxdWVzdFN0ZXBNYXAgPSBMLm1hcCgncXVlc3Qtc3RlcC1tYXAnKS5zZXRWaWV3KG1hcFZpZXcoKSwgMTUpO1xuXHQvL2FkZCBwaXJhdGUgbWFwIHRpbGVzXG5cdEwudGlsZUxheWVyKCdodHRwczovL2FwaS50aWxlcy5tYXBib3guY29tL3Y0L3tpZH0ve3p9L3t4fS97eX0ucG5nP2FjY2Vzc190b2tlbj17YWNjZXNzVG9rZW59Jywge1xuICAgIG1heFpvb206IDE4LFxuICAgIGlkOiAnc2NvdHRlZ2dzLm83NjE0amwyJyxcbiAgICBhY2Nlc3NUb2tlbjogJ3BrLmV5SjFJam9pYzJOdmRIUmxaMmR6SWl3aVlTSTZJbU5wYURab1p6aG1kakJqTURaMWNXbzVhR2N5YVhsdGVUa2lmUS5MWmUwLUlCUlFtWjBQa1FCc1lJbGl3J1xuXHR9KS5hZGRUbyhxdWVzdFN0ZXBNYXApO1xuXG5cdC8vIEluaXRpYWxpemUgdGhlIEZlYXR1cmVHcm91cCB0byBzdG9yZSBlZGl0YWJsZSBsYXllcnNcblx0dmFyIGRyYXduSXRlbXMgPSBuZXcgTC5GZWF0dXJlR3JvdXAoKTtcblx0cXVlc3RTdGVwTWFwLmFkZExheWVyKGRyYXduSXRlbXMpO1xuXG5cdC8vIEluaXRpYWxpemUgdGhlIGRyYXcgY29udHJvbCBhbmQgcGFzcyBpdCB0aGUgRmVhdHVyZUdyb3VwIG9mIGVkaXRhYmxlIGxheWVyc1xuXHR2YXIgZHJhd0NvbnRyb2wgPSBuZXcgTC5Db250cm9sLkRyYXcoe1xuXHQgICAgZHJhdzoge1xuXHQgICAgXHRwb2x5bGluZTogZmFsc2UsXG5cdCAgICBcdHBvbHlnb246IGZhbHNlLFxuXHQgICAgXHRyZWN0YW5nbGU6IGZhbHNlLFxuXHQgICAgXHRtYXJrZXI6IGZhbHNlXG5cdCAgICB9LFxuXHQgICAgZWRpdDoge1xuXHQgICAgICAgIGZlYXR1cmVHcm91cDogZHJhd25JdGVtc1xuXHQgICAgfVxuXHR9KTtcblx0cXVlc3RTdGVwTWFwLmFkZENvbnRyb2woZHJhd0NvbnRyb2wpO1xuXHQvL2lmIHRoZXJlIGlzIGEgdGFyZ2V0IHJlZ2lvbiwgZHJhdyBpdCBvbiB0aGUgbWFwXG5cdGlmICgkc2NvcGUuY3VycmVudFN0ZXAudGFyZ2V0Q2lyY2xlLmNlbnRlci5sZW5ndGggPT09IDIpIHtcblx0XHR2YXIgY3VycmVudFJlZ2lvbiA9IEwuY2lyY2xlKCRzY29wZS5jdXJyZW50U3RlcC50YXJnZXRDaXJjbGUuY2VudGVyLCRzY29wZS5jdXJyZW50U3RlcC50YXJnZXRDaXJjbGUucmFkaXVzKTtcblx0XHRxdWVzdFN0ZXBNYXAuYWRkTGF5ZXIoY3VycmVudFJlZ2lvbik7XG5cdH1cblx0dmFyIGNpcmNsZTtcblx0cXVlc3RTdGVwTWFwLm9uKCdkcmF3OmNyZWF0ZWQnLCBmdW5jdGlvbiAoZSkge1xuXHQvL3JlbW92ZSB0aGUgbG9hZGVkIHJlZ2lvbiB0aGVuIHJlbW92ZSBhbnkgbmV3bHkgZHJhd24gY2lyY2xlc1xuICBcdGlmKGN1cnJlbnRSZWdpb24pIHF1ZXN0U3RlcE1hcC5yZW1vdmVMYXllcihjdXJyZW50UmVnaW9uKTtcbiAgXHRpZihjaXJjbGUpIHF1ZXN0U3RlcE1hcC5yZW1vdmVMYXllcihjaXJjbGUpO1xuICBcdHZhciB0eXBlID0gZS5sYXllclR5cGU7XG4gIFx0dmFyIGxheWVyID0gZS5sYXllcjtcbiAgXHQvL2Fzc2lnbiB0YXJnZXQgcmVnaW9uIHRvIHByb3BlcnRpZXMgb2YgZHJhd24gb2JqZWN0XG4gICAgJHNjb3BlLmN1cnJlbnRTdGVwLnRhcmdldENpcmNsZS5jZW50ZXIgPSBbbGF5ZXIuX2xhdGxuZy5sYXQsbGF5ZXIuX2xhdGxuZy5sbmddO1xuICAgICRzY29wZS5jdXJyZW50U3RlcC50YXJnZXRDaXJjbGUucmFkaXVzID0gbGF5ZXIuX21SYWRpdXM7XG4gICAgLy9kZWNsYXJlIG5ldyBvYmplY3QgYmFzZWQgb24gcHJvcGVydGllZCBkcmF3biBhbmQgYWRkIHRvIG1hcFxuICAgIGNpcmNsZSA9IEwuY2lyY2xlKFtsYXllci5fbGF0bG5nLmxhdCxsYXllci5fbGF0bG5nLmxuZ10sIGxheWVyLl9tUmFkaXVzKTtcbiAgICBxdWVzdFN0ZXBNYXAuYWRkTGF5ZXIoY2lyY2xlKTtcblx0fSk7XG5cblx0JHNjb3BlLmdldE1vZGFsQnV0dG9uVGV4dCA9IGZ1bmN0aW9uKCkge1xuXHRcdGlmICgkc2NvcGUuY3VycmVudFN0ZXAudHJhbnNpdGlvbkluZm8ucXVlc3Rpb24ubGVuZ3RoKSByZXR1cm4gXCJTdWJtaXQhXCI7XG5cdFx0cmV0dXJuIFwiR290IGl0IVwiO1xuXHR9O1xufSk7XG5cblxuXG4iLCJhcHAuY29uZmlnKGZ1bmN0aW9uICgkc3RhdGVQcm92aWRlcil7XG5cdCRzdGF0ZVByb3ZpZGVyLnN0YXRlKCdkYXNoYm9hcmQnLHtcblx0XHR1cmw6ICcvZGFzaGJvYXJkLzp1c2VySWQnLFxuXHRcdHRlbXBsYXRlVXJsOiAnanMvdXNlci1kYXNoYm9hcmQvZGFzaGJvYXJkLmh0bWwnLFxuXHRcdGNvbnRyb2xsZXI6ICdEYXNoQ3RybCcsXG5cdFx0cmVzb2x2ZToge1xuXHRcdFx0dXNlclF1ZXN0czogZnVuY3Rpb24oUXVlc3RGYWN0b3J5LCAkc3RhdGVQYXJhbXMpe1xuXHRcdFx0XHRyZXR1cm4gUXVlc3RGYWN0b3J5LmdldFVzZXJRdWVzdHMoJHN0YXRlUGFyYW1zLnVzZXJJZCk7XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRkYXRhOiB7XG4gICAgICAgICAgICBhdXRoZW50aWNhdGU6IHRydWVcbiAgICAgICAgfVxuXHR9KTtcbn0pO1xuXG5hcHAuY29udHJvbGxlcignRGFzaEN0cmwnLCBmdW5jdGlvbiAoJHN0YXRlLCAkc2NvcGUsIHVzZXJRdWVzdHMsIFNlc3Npb24sIFF1ZXN0RmFjdG9yeSl7XG5cdCRzY29wZS5kYXNoYm9hcmQgPSB0cnVlO1xuXHQkc2NvcGUucXVlc3RzID0gW107XG5cdCRzY29wZS5xdWVzdHMgPSB1c2VyUXVlc3RzLm1hcChmdW5jdGlvbihnKSB7IFxuXHRcdGcuc2hvd0RldGFpbCA9IGZhbHNlO1xuXHRcdHJldHVybiBnO1xuXHR9KTtcblxuXHQkc2NvcGUuZ29Ub0VkaXRvciA9IGZ1bmN0aW9uIChxdWVzdENsaWNrZWQpIHtcblx0XHQkc3RhdGUuZ28oJ2VkaXRvcicsIHtpZDogcXVlc3RDbGlja2VkLl9pZH0sIHtyZWxvYWQ6IHRydWV9KTtcblx0fTtcblx0JHNjb3BlLmRlbGV0ZVF1ZXN0ID0gZnVuY3Rpb24gKHF1ZXN0Q2xpY2tlZCkge1xuXHRcdHJldHVybiBRdWVzdEZhY3RvcnkuZGVsZXRlKHF1ZXN0Q2xpY2tlZClcblx0XHQudGhlbiggZnVuY3Rpb24gKGRlbGV0ZWRRdWVzdCkge1xuXHRcdFx0JHN0YXRlLmdvKCdkYXNoYm9hcmQnLCB7dXNlcklkOiBTZXNzaW9uLnVzZXIuX2lkfSwge3JlbG9hZDogdHJ1ZX0pO1xuXHRcdH0pO1xuXHR9O1xuXHQkc2NvcGUucGFyZW50Q2xpY2sgPSBmdW5jdGlvbihpbmRleCkge1xuXHRcdHZhciBxdWVzdCA9ICRzY29wZS5xdWVzdHNbaW5kZXhdO1xuXHRcdHF1ZXN0LnNob3dEZXRhaWwgPSAhcXVlc3Quc2hvd0RldGFpbDtcblx0fTtcblx0JHNjb3BlLnN3aXRjaEFjdGl2ZSA9IGZ1bmN0aW9uIChxdWVzdENsaWNrZWQpIHtcblx0XHRRdWVzdEZhY3Rvcnkuc3dpdGNoQWN0aXZlKHF1ZXN0Q2xpY2tlZCk7XG5cdH07XG59KTtcblxuIiwiYXBwLmZhY3RvcnkoJ1F1ZXN0RmFjdG9yeScsIGZ1bmN0aW9uICgkaHR0cCwgU2Vzc2lvbikge1xuXG5cdHJldHVybiB7XG5cblx0XHRnZXRBbGxRdWVzdHM6IGZ1bmN0aW9uKCkge1xuXHRcdFx0cmV0dXJuICRodHRwLmdldCgnL2FwaS9xdWVzdHMnKVxuXHRcdFx0LnRoZW4oZnVuY3Rpb24ocmVzKSB7XG5cdFx0XHRcdHJldHVybiByZXMuZGF0YTtcblx0XHRcdH0pO1xuXHRcdH0sXG5cdFx0Z2V0T25lUXVlc3Q6IGZ1bmN0aW9uKHF1ZXN0SWQpe1xuXHRcdFx0cmV0dXJuICRodHRwLmdldCgnL2FwaS9xdWVzdHMvJyArIHF1ZXN0SWQpXG5cdFx0XHRcdC50aGVuKGZ1bmN0aW9uKHJlcyl7XG5cdFx0XHRcdFx0cmV0dXJuIHJlcy5kYXRhO1xuXHRcdFx0XHR9KTtcblx0XHR9LFxuXHRcdGdldFVzZXJRdWVzdHM6IGZ1bmN0aW9uKHVzZXJJZCkge1xuXHRcdFx0cmV0dXJuICRodHRwLmdldCgnL2FwaS9xdWVzdHMvdXNlcnF1ZXN0cy8nICsgdXNlcklkKVxuXHRcdFx0LnRoZW4oZnVuY3Rpb24ocmVzKXtcblx0XHRcdFx0cmV0dXJuIHJlcy5kYXRhO1xuXHRcdFx0fSk7XG5cdFx0fSxcblx0XHRzd2l0Y2hBY3RpdmU6IGZ1bmN0aW9uIChxdWVzdCkge1xuXHRcdFx0cmV0dXJuICRodHRwLnB1dCgnL2FwaS9xdWVzdHMvJyArIHF1ZXN0Ll9pZCwgcXVlc3QpXG5cdFx0XHQudGhlbihmdW5jdGlvbiAocmVzKXtcblx0XHRcdFx0cmV0dXJuIHJlcy5kYXRhO1xuXHRcdFx0fSk7XG5cdFx0fSxcblx0XHRzYXZlTmV3OiBmdW5jdGlvbiAocXVlc3QpIHtcblx0XHRcdHF1ZXN0LmF1dGhvciA9IFNlc3Npb24udXNlci5faWQ7XG5cdFx0XHRyZXR1cm4gJGh0dHAucG9zdCgnL2FwaS9xdWVzdHMvJywgcXVlc3QpXG5cdFx0XHQudGhlbihmdW5jdGlvbiAocmVzKSB7XG5cdFx0XHRcdHJldHVybiByZXMuZGF0YTtcblx0XHRcdH0pO1xuXHRcdH0sXG5cdFx0ZGVsZXRlOiBmdW5jdGlvbiAocXVlc3QpIHtcblx0XHRcdHJldHVybiAkaHR0cC5kZWxldGUoJy9hcGkvcXVlc3RzLycgKyBxdWVzdC5faWQpO1xuXHRcdH1cblx0fTtcbn0pO1xuIiwiYXBwLmRpcmVjdGl2ZSgnZnVsbHN0YWNrTG9nbycsIGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4ge1xuICAgICAgICByZXN0cmljdDogJ0UnLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2NvbW1vbi9kaXJlY3RpdmVzL2Z1bGxzdGFjay1sb2dvL2Z1bGxzdGFjay1sb2dvLmh0bWwnXG4gICAgfTtcbn0pOyIsImFwcC5kaXJlY3RpdmUoJ25hdmJhcicsIGZ1bmN0aW9uICgkcm9vdFNjb3BlLCBBdXRoU2VydmljZSwgQVVUSF9FVkVOVFMsICRzdGF0ZSkge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgcmVzdHJpY3Q6ICdFJyxcbiAgICAgICAgc2NvcGU6IHtcbiAgICAgICAgICAgIGhvbWU6ICc9JyxcbiAgICAgICAgICAgIGRhc2hib2FyZDogJz0nXG4gICAgICAgIH0sXG4gICAgICAgIHRlbXBsYXRlVXJsOiAnanMvY29tbW9uL2RpcmVjdGl2ZXMvbmF2YmFyL25hdmJhci5odG1sJyxcbiAgICAgICAgbGluazogZnVuY3Rpb24gKHNjb3BlKSB7XG5cbiAgICAgICAgICAgIHNjb3BlLml0ZW1zID0gW1xuICAgICAgICAgICAgICAgIHsgbGFiZWw6ICdEYXNoYm9hcmQnLCBzdGF0ZTogJ2hvbWUnICwgYXV0aDogdHJ1ZX0sXG4gICAgICAgICAgICAgICAgeyBsYWJlbDogJ05ldyBRdWVzdCcsIHN0YXRlOiAnZWRpdG9yJywgYXV0aDogdHJ1ZSB9XG4gICAgICAgICAgICBdO1xuXG4gICAgICAgICAgICBzY29wZS51c2VyID0gbnVsbDtcblxuICAgICAgICAgICAgc2NvcGUuaXNMb2dnZWRJbiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gQXV0aFNlcnZpY2UuaXNBdXRoZW50aWNhdGVkKCk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBzY29wZS5sb2dvdXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgQXV0aFNlcnZpY2UubG9nb3V0KCkudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgJHN0YXRlLmdvKCdob21lJyk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICB2YXIgc2V0VXNlciA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBBdXRoU2VydmljZS5nZXRMb2dnZWRJblVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgICAgICAgICAgICAgIHNjb3BlLnVzZXIgPSB1c2VyO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgdmFyIHJlbW92ZVVzZXIgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgc2NvcGUudXNlciA9IG51bGw7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBzZXRVc2VyKCk7XG5cbiAgICAgICAgICAgICRyb290U2NvcGUuJG9uKEFVVEhfRVZFTlRTLmxvZ2luU3VjY2Vzcywgc2V0VXNlcik7XG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRvbihBVVRIX0VWRU5UUy5sb2dvdXRTdWNjZXNzLCByZW1vdmVVc2VyKTtcbiAgICAgICAgICAgICRyb290U2NvcGUuJG9uKEFVVEhfRVZFTlRTLnNlc3Npb25UaW1lb3V0LCByZW1vdmVVc2VyKTtcblxuICAgICAgICAgICAgLy8gSWYgbm90ICdIb21lJywgcmVtb3ZlIHNjcm9sbCBhbmltYXRpb25cbiAgICAgICAgICAgICRyb290U2NvcGUuJG9uKCckc3RhdGVDaGFuZ2VTdWNjZXNzJywgZnVuY3Rpb24gKGV2ZW50LCB0b1N0YXRlKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRvU3RhdGUubmFtZSAhPT0gJ2hvbWUnKSB7XG4gICAgICAgICAgICAgICAgICAgICQoJy5uYXZiYXItZml4ZWQtdG9wJykuYWRkQ2xhc3MoJ3RvcC1uYXYtY29sbGFwc2UnKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAkKCcubmF2YmFyLWZpeGVkLXRvcCcpLnJlbW92ZUNsYXNzKCd0b3AtbmF2LWNvbGxhcHNlJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIFByZXR0eSBTY3JvbGxpbmcgTmF2YmFyIEVmZmVjdFxuICAgICAgICAgICAgJCh3aW5kb3cpLnNjcm9sbChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICBpZiAoJCgnLm5hdmJhcicpLm9mZnNldCgpLnRvcCA+IDUwICYmIHNjb3BlLmhvbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgJCgnLm5hdmJhci1maXhlZC10b3AnKS5hZGRDbGFzcygndG9wLW5hdi1jb2xsYXBzZScpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICQoJy5uYXZiYXItZml4ZWQtdG9wJykucmVtb3ZlQ2xhc3MoJ3RvcC1uYXYtY29sbGFwc2UnKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gQW5pbWF0ZWQgU2Nyb2xsIFRvIFNlY3Rpb25cbiAgICAgICAgICAgICQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgJCgnLnBhZ2Utc2Nyb2xsIGEnKS5iaW5kKCdjbGljaycsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgJGFuY2hvciA9ICQodGhpcyk7XG4gICAgICAgICAgICAgICAgICAgICQoJ2h0bWwsIGJvZHknKS5zdG9wKCkuYW5pbWF0ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICBzY3JvbGxUb3A6ICQoJGFuY2hvci5hdHRyKCdocmVmJykpLm9mZnNldCgpLnRvcFxuICAgICAgICAgICAgICAgICAgICB9LCAxNTAwLCAnZWFzZUluT3V0RXhwbycpO1xuICAgICAgICAgICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgfVxuXG4gICAgfTtcblxufSk7XG4iXSwic291cmNlUm9vdCI6Ii9zb3VyY2UvIn0=
