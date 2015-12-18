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

(function () {

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
});
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
								QuestFactory.save(questClicked);
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
								save: function save(quest) {
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
																				console.log('going not home');
																} else {
																				$('.navbar-fixed-top').removeClass('top-nav-collapse');
																				console.log('going home');
																}
												});

												// Pretty Scrolling Navbar Effect
												$(window).scroll(function () {
																if ($('.navbar').offset().top > 50 && scope.home) {
																				$('.navbar-fixed-top').addClass('top-nav-collapse');
																				console.log('doooowwwwwn');
																} else if (scope.home) {
																				$('.navbar-fixed-top').removeClass('top-nav-collapse');
																				console.log('uuuuuuup');
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

app.directive('fullstackLogo', function () {
				return {
								restrict: 'E',
								templateUrl: 'js/common/directives/fullstack-logo/fullstack-logo.html'
				};
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImFwcC5qcyIsImZzYS9mc2EtcHJlLWJ1aWx0LmpzIiwiaG9tZS9ob21lLmpzIiwicXVlc3QtZWRpdG9yL2VkaXRvci5qcyIsInF1ZXN0LXN0ZXAtZWRpdG9yL3F1ZXN0LXN0ZXAtZWRpdG9yLmpzIiwidXNlci1kYXNoYm9hcmQvZGFzaGJvYXJkLmpzIiwiY29tbW9uL2ZhY3Rvcmllcy9xdWVzdEZhY3RvcnkuanMiLCJjb21tb24vZGlyZWN0aXZlcy9uYXZiYXIvbmF2YmFyLmpzIiwiY29tbW9uL2RpcmVjdGl2ZXMvZnVsbHN0YWNrLWxvZ28vZnVsbHN0YWNrLWxvZ28uanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBQSxDQUFBO0FBQ0EsTUFBQSxDQUFBLEdBQUEsR0FBQSxPQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsRUFBQSxDQUFBLGFBQUEsRUFBQSxXQUFBLEVBQUEsYUFBQSxFQUFBLGNBQUEsRUFBQSxXQUFBLEVBQUEsbUJBQUEsQ0FBQSxDQUFBLENBQUE7O0FBRUEsR0FBQSxDQUFBLE1BQUEsQ0FBQSxVQUFBLGtCQUFBLEVBQUEsaUJBQUEsRUFBQTs7QUFFQSxxQkFBQSxDQUFBLFNBQUEsQ0FBQSxJQUFBLENBQUEsQ0FBQTs7QUFFQSxzQkFBQSxDQUFBLFNBQUEsQ0FBQSxZQUFBLENBQUEsQ0FBQTtDQUNBLENBQUEsQ0FBQTs7O0FBR0EsR0FBQSxDQUFBLEdBQUEsQ0FBQSxVQUFBLFVBQUEsRUFBQSxXQUFBLEVBQUEsTUFBQSxFQUFBOzs7QUFHQSxRQUFBLDRCQUFBLEdBQUEsU0FBQSw0QkFBQSxDQUFBLEtBQUEsRUFBQTtBQUNBLGVBQUEsS0FBQSxDQUFBLElBQUEsSUFBQSxLQUFBLENBQUEsSUFBQSxDQUFBLFlBQUEsQ0FBQTtLQUNBLENBQUE7Ozs7QUFJQSxjQUFBLENBQUEsR0FBQSxDQUFBLG1CQUFBLEVBQUEsVUFBQSxLQUFBLEVBQUEsT0FBQSxFQUFBLFFBQUEsRUFBQTs7QUFFQSxZQUFBLENBQUEsNEJBQUEsQ0FBQSxPQUFBLENBQUEsRUFBQTs7O0FBR0EsbUJBQUE7U0FDQTs7QUFFQSxZQUFBLFdBQUEsQ0FBQSxlQUFBLEVBQUEsRUFBQTs7O0FBR0EsbUJBQUE7U0FDQTs7O0FBR0EsYUFBQSxDQUFBLGNBQUEsRUFBQSxDQUFBOztBQUVBLG1CQUFBLENBQUEsZUFBQSxFQUFBLENBQUEsSUFBQSxDQUFBLFVBQUEsSUFBQSxFQUFBOzs7O0FBSUEsZ0JBQUEsSUFBQSxFQUFBO0FBQ0Esc0JBQUEsQ0FBQSxFQUFBLENBQUEsT0FBQSxDQUFBLElBQUEsRUFBQSxRQUFBLENBQUEsQ0FBQTthQUNBLE1BQUE7QUFDQSxzQkFBQSxDQUFBLEVBQUEsQ0FBQSxPQUFBLENBQUEsQ0FBQTthQUNBO1NBQ0EsQ0FBQSxDQUFBO0tBRUEsQ0FBQSxDQUFBO0NBRUEsQ0FBQSxDQUFBOztBQ2xEQSxDQUFBLFlBQUE7O0FBRUEsZ0JBQUEsQ0FBQTs7O0FBR0EsUUFBQSxDQUFBLE1BQUEsQ0FBQSxPQUFBLEVBQUEsTUFBQSxJQUFBLEtBQUEsQ0FBQSx3QkFBQSxDQUFBLENBQUE7O0FBRUEsUUFBQSxHQUFBLEdBQUEsT0FBQSxDQUFBLE1BQUEsQ0FBQSxhQUFBLEVBQUEsRUFBQSxDQUFBLENBQUE7O0FBRUEsT0FBQSxDQUFBLE9BQUEsQ0FBQSxRQUFBLEVBQUEsWUFBQTtBQUNBLFlBQUEsQ0FBQSxNQUFBLENBQUEsRUFBQSxFQUFBLE1BQUEsSUFBQSxLQUFBLENBQUEsc0JBQUEsQ0FBQSxDQUFBO0FBQ0EsZUFBQSxNQUFBLENBQUEsRUFBQSxDQUFBLE1BQUEsQ0FBQSxRQUFBLENBQUEsTUFBQSxDQUFBLENBQUE7S0FDQSxDQUFBLENBQUE7Ozs7O0FBS0EsT0FBQSxDQUFBLFFBQUEsQ0FBQSxhQUFBLEVBQUE7QUFDQSxvQkFBQSxFQUFBLG9CQUFBO0FBQ0EsbUJBQUEsRUFBQSxtQkFBQTtBQUNBLHFCQUFBLEVBQUEscUJBQUE7QUFDQSxzQkFBQSxFQUFBLHNCQUFBO0FBQ0Esd0JBQUEsRUFBQSx3QkFBQTtBQUNBLHFCQUFBLEVBQUEscUJBQUE7S0FDQSxDQUFBLENBQUE7O0FBRUEsT0FBQSxDQUFBLE9BQUEsQ0FBQSxpQkFBQSxFQUFBLFVBQUEsVUFBQSxFQUFBLEVBQUEsRUFBQSxXQUFBLEVBQUE7QUFDQSxZQUFBLFVBQUEsR0FBQTtBQUNBLGVBQUEsRUFBQSxXQUFBLENBQUEsZ0JBQUE7QUFDQSxlQUFBLEVBQUEsV0FBQSxDQUFBLGFBQUE7QUFDQSxlQUFBLEVBQUEsV0FBQSxDQUFBLGNBQUE7QUFDQSxlQUFBLEVBQUEsV0FBQSxDQUFBLGNBQUE7U0FDQSxDQUFBO0FBQ0EsZUFBQTtBQUNBLHlCQUFBLEVBQUEsdUJBQUEsUUFBQSxFQUFBO0FBQ0EsMEJBQUEsQ0FBQSxVQUFBLENBQUEsVUFBQSxDQUFBLFFBQUEsQ0FBQSxNQUFBLENBQUEsRUFBQSxRQUFBLENBQUEsQ0FBQTtBQUNBLHVCQUFBLEVBQUEsQ0FBQSxNQUFBLENBQUEsUUFBQSxDQUFBLENBQUE7YUFDQTtTQUNBLENBQUE7S0FDQSxDQUFBLENBQUE7O0FBRUEsT0FBQSxDQUFBLE1BQUEsQ0FBQSxVQUFBLGFBQUEsRUFBQTtBQUNBLHFCQUFBLENBQUEsWUFBQSxDQUFBLElBQUEsQ0FBQSxDQUNBLFdBQUEsRUFDQSxVQUFBLFNBQUEsRUFBQTtBQUNBLG1CQUFBLFNBQUEsQ0FBQSxHQUFBLENBQUEsaUJBQUEsQ0FBQSxDQUFBO1NBQ0EsQ0FDQSxDQUFBLENBQUE7S0FDQSxDQUFBLENBQUE7QUFDQSxPQUFBLENBQUEsT0FBQSxDQUFBLGFBQUEsRUFBQSxVQUFBLEtBQUEsRUFBQSxPQUFBLEVBQUEsVUFBQSxFQUFBLFdBQUEsRUFBQSxFQUFBLEVBQUE7O0FBRUEsaUJBQUEsaUJBQUEsQ0FBQSxRQUFBLEVBQUE7QUFDQSxnQkFBQSxJQUFBLEdBQUEsUUFBQSxDQUFBLElBQUEsQ0FBQTtBQUNBLG1CQUFBLENBQUEsTUFBQSxDQUFBLElBQUEsQ0FBQSxFQUFBLEVBQUEsSUFBQSxDQUFBLElBQUEsQ0FBQSxDQUFBO0FBQ0Esc0JBQUEsQ0FBQSxVQUFBLENBQUEsV0FBQSxDQUFBLFlBQUEsQ0FBQSxDQUFBO0FBQ0EsbUJBQUEsSUFBQSxDQUFBLElBQUEsQ0FBQTtTQUNBOzs7O0FBSUEsWUFBQSxDQUFBLGVBQUEsR0FBQSxZQUFBO0FBQ0EsbUJBQUEsQ0FBQSxDQUFBLE9BQUEsQ0FBQSxJQUFBLENBQUE7U0FDQSxDQUFBOztBQUVBLFlBQUEsQ0FBQSxlQUFBLEdBQUEsVUFBQSxVQUFBLEVBQUE7Ozs7Ozs7Ozs7QUFVQSxnQkFBQSxJQUFBLENBQUEsZUFBQSxFQUFBLElBQUEsVUFBQSxLQUFBLElBQUEsRUFBQTtBQUNBLHVCQUFBLEVBQUEsQ0FBQSxJQUFBLENBQUEsT0FBQSxDQUFBLElBQUEsQ0FBQSxDQUFBO2FBQ0E7Ozs7O0FBS0EsbUJBQUEsS0FBQSxDQUFBLEdBQUEsQ0FBQSxVQUFBLENBQUEsQ0FBQSxJQUFBLENBQUEsaUJBQUEsQ0FBQSxTQUFBLENBQUEsWUFBQTtBQUNBLHVCQUFBLElBQUEsQ0FBQTthQUNBLENBQUEsQ0FBQTtTQUVBLENBQUE7O0FBRUEsWUFBQSxDQUFBLEtBQUEsR0FBQSxVQUFBLFdBQUEsRUFBQTtBQUNBLG1CQUFBLEtBQUEsQ0FBQSxJQUFBLENBQUEsUUFBQSxFQUFBLFdBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxpQkFBQSxDQUFBLFNBQ0EsQ0FBQSxZQUFBO0FBQ0EsdUJBQUEsRUFBQSxDQUFBLE1BQUEsQ0FBQSxFQUFBLE9BQUEsRUFBQSw0QkFBQSxFQUFBLENBQUEsQ0FBQTthQUNBLENBQUEsQ0FBQTtTQUNBLENBQUE7O0FBR0EsWUFBQSxDQUFBLE1BQUEsR0FBQSxVQUFBLFdBQUEsRUFBQTs7QUFFQSxtQkFBQSxLQUFBLENBQUEsSUFBQSxDQUFBLGtCQUFBLEVBQUEsV0FBQSxDQUFBOzthQUVBLElBQUEsQ0FBQSxVQUFBLFFBQUEsRUFBQTs7QUFFQSx1QkFBQSxLQUFBLENBQUEsSUFBQSxDQUFBLFFBQUEsRUFBQSxXQUFBLENBQUEsQ0FBQTthQUNBLENBQUEsQ0FDQSxJQUFBLENBQUEsaUJBQUEsQ0FBQSxTQUNBLENBQUEsWUFBQTtBQUNBLHVCQUFBLEVBQUEsQ0FBQSxNQUFBLENBQUEsRUFBQSxPQUFBLEVBQUEsNkJBQUEsRUFBQSxDQUFBLENBQUE7YUFDQSxDQUFBLENBQUE7U0FDQSxDQUFBOztBQUVBLFlBQUEsQ0FBQSxNQUFBLEdBQUEsWUFBQTtBQUNBLG1CQUFBLEtBQUEsQ0FBQSxHQUFBLENBQUEsU0FBQSxDQUFBLENBQUEsSUFBQSxDQUFBLFlBQUE7QUFDQSx1QkFBQSxDQUFBLE9BQUEsRUFBQSxDQUFBO0FBQ0EsMEJBQUEsQ0FBQSxVQUFBLENBQUEsV0FBQSxDQUFBLGFBQUEsQ0FBQSxDQUFBO2FBQ0EsQ0FBQSxDQUFBO1NBQ0EsQ0FBQTtLQUVBLENBQUEsQ0FBQTs7QUFFQSxPQUFBLENBQUEsT0FBQSxDQUFBLFNBQUEsRUFBQSxVQUFBLFVBQUEsRUFBQSxXQUFBLEVBQUE7O0FBRUEsWUFBQSxJQUFBLEdBQUEsSUFBQSxDQUFBOztBQUVBLGtCQUFBLENBQUEsR0FBQSxDQUFBLFdBQUEsQ0FBQSxnQkFBQSxFQUFBLFlBQUE7QUFDQSxnQkFBQSxDQUFBLE9BQUEsRUFBQSxDQUFBO1NBQ0EsQ0FBQSxDQUFBOztBQUVBLGtCQUFBLENBQUEsR0FBQSxDQUFBLFdBQUEsQ0FBQSxjQUFBLEVBQUEsWUFBQTtBQUNBLGdCQUFBLENBQUEsT0FBQSxFQUFBLENBQUE7U0FDQSxDQUFBLENBQUE7O0FBRUEsWUFBQSxDQUFBLEVBQUEsR0FBQSxJQUFBLENBQUE7QUFDQSxZQUFBLENBQUEsSUFBQSxHQUFBLElBQUEsQ0FBQTs7QUFFQSxZQUFBLENBQUEsTUFBQSxHQUFBLFVBQUEsU0FBQSxFQUFBLElBQUEsRUFBQTtBQUNBLGdCQUFBLENBQUEsRUFBQSxHQUFBLFNBQUEsQ0FBQTtBQUNBLGdCQUFBLENBQUEsSUFBQSxHQUFBLElBQUEsQ0FBQTtTQUNBLENBQUE7O0FBRUEsWUFBQSxDQUFBLE9BQUEsR0FBQSxZQUFBO0FBQ0EsZ0JBQUEsQ0FBQSxFQUFBLEdBQUEsSUFBQSxDQUFBO0FBQ0EsZ0JBQUEsQ0FBQSxJQUFBLEdBQUEsSUFBQSxDQUFBO1NBQ0EsQ0FBQTtLQUVBLENBQUEsQ0FBQTtDQUVBLENBQUEsRUFBQSxDQUFBOztBQ2xKQSxHQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsY0FBQSxFQUFBOztBQUVBLGtCQUFBLENBQUEsS0FBQSxDQUFBLE1BQUEsRUFBQTtBQUNBLFdBQUEsRUFBQSxHQUFBO0FBQ0EsbUJBQUEsRUFBQSxtQkFBQTtBQUNBLGtCQUFBLEVBQUEsVUFBQTtBQUNBLGVBQUEsRUFBQTtBQUNBLHlCQUFBLEVBQUEsdUJBQUEsV0FBQSxFQUFBO0FBQ0EsdUJBQUEsV0FBQSxDQUFBLGVBQUEsRUFBQSxDQUFBO2FBQ0E7U0FDQTtLQUNBLENBQUEsQ0FBQTtDQUVBLENBQUEsQ0FBQTs7QUFFQSxHQUFBLENBQUEsVUFBQSxDQUFBLFVBQUEsRUFBQSxVQUFBLE1BQUEsRUFBQSxXQUFBLEVBQUEsTUFBQSxFQUFBLGFBQUEsRUFBQTs7QUFFQSxRQUFBLGFBQUEsRUFBQSxNQUFBLENBQUEsRUFBQSxDQUFBLFdBQUEsRUFBQSxFQUFBLE1BQUEsRUFBQSxhQUFBLENBQUEsR0FBQSxFQUFBLENBQUEsQ0FBQTs7QUFFQSxVQUFBLENBQUEsSUFBQSxHQUFBLElBQUEsQ0FBQTtBQUNBLFVBQUEsQ0FBQSxLQUFBLEdBQUEsRUFBQSxDQUFBO0FBQ0EsVUFBQSxDQUFBLE1BQUEsR0FBQSxFQUFBLENBQUE7QUFDQSxVQUFBLENBQUEsVUFBQSxHQUFBLElBQUEsQ0FBQTtBQUNBLFVBQUEsQ0FBQSxXQUFBLEdBQUEsSUFBQSxDQUFBOztBQUVBLFVBQUEsQ0FBQSxTQUFBLEdBQUEsVUFBQSxTQUFBLEVBQUE7QUFDQSxjQUFBLENBQUEsS0FBQSxHQUFBLElBQUEsQ0FBQTs7QUFFQSxtQkFBQSxDQUFBLEtBQUEsQ0FBQSxTQUFBLENBQUEsQ0FBQSxJQUFBLENBQUEsVUFBQSxJQUFBLEVBQUE7QUFDQSxrQkFBQSxDQUFBLEVBQUEsQ0FBQSxXQUFBLEVBQUEsRUFBQSxNQUFBLEVBQUEsSUFBQSxDQUFBLEdBQUEsRUFBQSxDQUFBLENBQUE7U0FDQSxDQUFBLFNBQUEsQ0FBQSxZQUFBO0FBQ0Esa0JBQUEsQ0FBQSxLQUFBLEdBQUEsZ0RBQUEsQ0FBQTtTQUNBLENBQUEsQ0FBQTtLQUVBLENBQUE7O0FBRUEsVUFBQSxDQUFBLFVBQUEsR0FBQSxVQUFBLFVBQUEsRUFBQTtBQUNBLGNBQUEsQ0FBQSxLQUFBLEdBQUEsSUFBQSxDQUFBO0FBQ0EsbUJBQUEsQ0FBQSxNQUFBLENBQUEsVUFBQSxDQUFBLENBQUEsSUFBQSxDQUFBLFVBQUEsSUFBQSxFQUFBO0FBQ0Esa0JBQUEsQ0FBQSxFQUFBLENBQUEsV0FBQSxFQUFBLEVBQUEsTUFBQSxFQUFBLElBQUEsQ0FBQSxHQUFBLEVBQUEsRUFBQSxFQUFBLE1BQUEsRUFBQSxJQUFBLEVBQUEsQ0FBQSxDQUFBO1NBQ0EsQ0FBQSxTQUFBLENBQUEsWUFBQTtBQUNBLGtCQUFBLENBQUEsS0FBQSxHQUFBLGlEQUFBLENBQUE7U0FDQSxDQUFBLENBQUE7S0FDQSxDQUFBOzs7QUFHQSxLQUFBLENBQUEsWUFBQTs7QUFFQSxZQUFBLE9BQUEsR0FBQSxDQUFBLENBQUEsTUFBQSxDQUFBLENBQUE7O0FBRUEsU0FBQSxDQUFBLGlDQUFBLENBQUEsQ0FBQSxJQUFBLENBQUEsWUFBQTtBQUNBLGdCQUFBLE1BQUEsR0FBQSxDQUFBLENBQUEsSUFBQSxDQUFBLENBQUE7QUFDQSxhQUFBLENBQUEsTUFBQSxDQUFBLENBQUEsTUFBQSxDQUFBLFlBQUE7OztBQUdBLG9CQUFBLElBQUEsR0FBQSxFQUFBLE9BQUEsQ0FBQSxTQUFBLEVBQUEsR0FBQSxNQUFBLENBQUEsSUFBQSxDQUFBLE9BQUEsQ0FBQSxDQUFBLENBQUE7O0FBRUEsb0JBQUEsTUFBQSxHQUFBLE1BQUEsR0FBQSxJQUFBLEdBQUEsSUFBQSxDQUFBOztBQUVBLHNCQUFBLENBQUEsR0FBQSxDQUFBLEVBQUEsa0JBQUEsRUFBQSxNQUFBLEVBQUEsQ0FBQSxDQUFBO2FBQ0EsQ0FBQSxDQUFBO1NBQ0EsQ0FBQSxDQUFBO0tBQ0EsQ0FBQSxDQUFBO0NBSUEsQ0FBQSxDQUFBO0FDbEVBLEdBQUEsQ0FBQSxNQUFBLENBQUEsVUFBQSxjQUFBLEVBQUE7QUFDQSxrQkFBQSxDQUFBLEtBQUEsQ0FBQSxRQUFBLEVBQ0E7QUFDQSxXQUFBLEVBQUEsYUFBQTtBQUNBLG1CQUFBLEVBQUEsNkJBQUE7QUFDQSxrQkFBQSxFQUFBLFlBQUE7QUFDQSxlQUFBLEVBQUE7QUFDQSxpQkFBQSxFQUFBLGVBQUEsWUFBQSxFQUFBLFlBQUEsRUFBQTtBQUNBLHVCQUFBLFlBQUEsQ0FBQSxFQUFBLEtBQUEsRUFBQSxHQUNBLFlBQUEsQ0FBQSxXQUFBLENBQUEsWUFBQSxDQUFBLEVBQUEsQ0FBQSxHQUNBLFNBQUEsQ0FBQTthQUNBO1NBQ0E7QUFDQSxZQUFBLEVBQUE7QUFDQSx3QkFBQSxFQUFBLElBQUE7U0FDQTtLQUNBLENBQUEsQ0FBQTtDQUNBLENBQUEsQ0FBQTs7QUFFQSxHQUFBLENBQUEsVUFBQSxDQUFBLFlBQUEsRUFBQSxVQUFBLE1BQUEsRUFBQSxZQUFBLEVBQUEsU0FBQSxFQUFBLE1BQUEsRUFBQSxVQUFBLEVBQUEsS0FBQSxFQUFBLE9BQUEsRUFBQSxZQUFBLEVBQUE7O0FBRUEsY0FBQSxDQUFBLGFBQUEsR0FBQSxJQUFBLENBQUE7QUFDQSxVQUFBLENBQUEsS0FBQSxHQUFBLEtBQUEsQ0FBQTtBQUNBLFVBQUEsQ0FBQSxXQUFBLEdBQUEsSUFBQSxDQUFBO0FBQ0EsVUFBQSxDQUFBLFFBQUEsR0FBQSxLQUFBLENBQUE7O0FBRUEsUUFBQSxDQUFBLEtBQUEsRUFBQTtBQUNBLGNBQUEsQ0FBQSxRQUFBLEdBQUEsSUFBQSxDQUFBO0FBQ0EsY0FBQSxDQUFBLEtBQUEsR0FBQTtBQUNBLGlCQUFBLEVBQUEsQ0FBQSxTQUFBLEVBQUEsQ0FBQSxVQUFBLENBQUE7U0FDQSxDQUFBO0tBQ0E7OztBQUdBLFVBQUEsQ0FBQSxTQUFBLEdBQUEsWUFBQTtBQUNBLFlBQUEsQ0FBQSxNQUFBLENBQUEsUUFBQSxFQUFBO0FBQ0EsbUJBQUEsWUFBQSxDQUFBLElBQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFlBQUE7QUFDQSxzQkFBQSxDQUFBLEVBQUEsQ0FBQSxXQUFBLEVBQUEsRUFBQSxNQUFBLEVBQUEsT0FBQSxDQUFBLElBQUEsQ0FBQSxHQUFBLEVBQUEsQ0FBQSxDQUFBO2FBQ0EsQ0FBQSxDQUFBO1NBQ0EsTUFBQTtBQUNBLG1CQUFBLFlBQUEsQ0FBQSxPQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxZQUFBO0FBQ0Esc0JBQUEsQ0FBQSxFQUFBLENBQUEsV0FBQSxFQUFBLEVBQUEsTUFBQSxFQUFBLE9BQUEsQ0FBQSxJQUFBLENBQUEsR0FBQSxFQUFBLENBQUEsQ0FBQTthQUNBLENBQUEsQ0FBQTtTQUNBO0tBQ0EsQ0FBQTs7QUFFQSxVQUFBLENBQUEsMEJBQUEsR0FBQSxZQUFBO0FBQ0EsWUFBQSxDQUFBLE1BQUEsQ0FBQSxRQUFBLEVBQUE7QUFDQSxtQkFBQSxZQUFBLENBQUEsSUFBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsWUFBQTtBQUNBLG9CQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLE1BQUEsS0FBQSxDQUFBLEVBQUE7QUFDQSwwQkFBQSxDQUFBLEVBQUEsQ0FBQSxrQkFBQSxFQUFBLEVBQUEsV0FBQSxFQUFBLElBQUEsRUFBQSxDQUFBLENBQUE7aUJBQ0EsTUFBQTtBQUNBLDBCQUFBLENBQUEsRUFBQSxDQUFBLGtCQUFBLEVBQUEsRUFBQSxXQUFBLEVBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsQ0FBQSxDQUFBLENBQUEsR0FBQSxFQUFBLENBQUEsQ0FBQTtpQkFDQTtBQUNBLHNCQUFBLENBQUEsYUFBQSxHQUFBLEtBQUEsQ0FBQTthQUNBLENBQUEsQ0FBQTtTQUNBLE1BQUE7QUFDQSxtQkFBQSxZQUFBLENBQUEsT0FBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsVUFBQSxVQUFBLEVBQUE7QUFDQSxzQkFBQSxDQUFBLGFBQUEsR0FBQSxLQUFBLENBQUE7QUFDQSxzQkFBQSxDQUFBLEVBQUEsQ0FBQSxrQkFBQSxFQUFBLEVBQUEsRUFBQSxFQUFBLFVBQUEsQ0FBQSxHQUFBLEVBQUEsV0FBQSxFQUFBLElBQUEsRUFBQSxDQUFBLENBQUE7YUFDQSxDQUFBLENBQUE7U0FDQTtLQUNBLENBQUE7OztBQUdBLFFBQUEsUUFBQSxHQUFBLENBQUEsQ0FBQSxHQUFBLENBQUEsV0FBQSxDQUFBLENBQUEsT0FBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsS0FBQSxFQUFBLEVBQUEsQ0FBQSxDQUFBOztBQUVBLEtBQUEsQ0FBQSxTQUFBLENBQUEsaUZBQUEsRUFBQTtBQUNBLGVBQUEsRUFBQSxFQUFBO0FBQ0EsVUFBQSxFQUFBLG9CQUFBO0FBQ0EsbUJBQUEsRUFBQSw4RkFBQTtLQUNBLENBQUEsQ0FBQSxLQUFBLENBQUEsUUFBQSxDQUFBLENBQUE7O0FBRUEsUUFBQSxVQUFBLEdBQUEsSUFBQSxDQUFBLENBQUEsWUFBQSxFQUFBLENBQUE7QUFDQSxZQUFBLENBQUEsUUFBQSxDQUFBLFVBQUEsQ0FBQSxDQUFBOzs7QUFHQSxRQUFBLFdBQUEsR0FBQSxJQUFBLENBQUEsQ0FBQSxPQUFBLENBQUEsSUFBQSxDQUFBO0FBQ0EsWUFBQSxFQUFBO0FBQ0Esb0JBQUEsRUFBQSxLQUFBO0FBQ0EsbUJBQUEsRUFBQSxLQUFBO0FBQ0EscUJBQUEsRUFBQSxLQUFBO0FBQ0Esa0JBQUEsRUFBQSxLQUFBO1NBQ0E7QUFDQSxZQUFBLEVBQUE7QUFDQSx3QkFBQSxFQUFBLFVBQUE7U0FDQTtLQUNBLENBQUEsQ0FBQTs7QUFFQSxZQUFBLENBQUEsVUFBQSxDQUFBLFdBQUEsQ0FBQSxDQUFBOztBQUVBLFFBQUEsTUFBQSxHQUFBLENBQUEsQ0FBQSxNQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxLQUFBLEVBQUEsRUFBQSxTQUFBLEVBQUEsSUFBQSxFQUFBLENBQUEsQ0FBQTtBQUNBLFlBQUEsQ0FBQSxRQUFBLENBQUEsTUFBQSxDQUFBLENBQUE7O0FBRUEsWUFBQSxDQUFBLEVBQUEsQ0FBQSxjQUFBLEVBQUEsVUFBQSxDQUFBLEVBQUE7O0FBRUEsWUFBQSxNQUFBLEVBQUEsUUFBQSxDQUFBLFdBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQTtBQUNBLFlBQUEsSUFBQSxHQUFBLENBQUEsQ0FBQSxTQUFBLENBQUE7QUFDQSxZQUFBLEtBQUEsR0FBQSxDQUFBLENBQUEsS0FBQSxDQUFBOztBQUVBLGNBQUEsQ0FBQSxLQUFBLENBQUEsS0FBQSxHQUFBLENBQUEsS0FBQSxDQUFBLE9BQUEsQ0FBQSxHQUFBLEVBQUEsS0FBQSxDQUFBLE9BQUEsQ0FBQSxHQUFBLENBQUEsQ0FBQTs7QUFFQSxjQUFBLEdBQUEsQ0FBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBLEtBQUEsQ0FBQSxPQUFBLENBQUEsR0FBQSxFQUFBLEtBQUEsQ0FBQSxPQUFBLENBQUEsR0FBQSxDQUFBLEVBQUEsRUFBQSxTQUFBLEVBQUEsSUFBQSxFQUFBLENBQUEsQ0FBQTtBQUNBLGdCQUFBLENBQUEsUUFBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBO0tBQ0EsQ0FBQSxDQUFBOztBQUVBLFVBQUEsQ0FBQSxFQUFBLENBQUEsU0FBQSxFQUFBLFVBQUEsQ0FBQSxFQUFBO0FBQ0EsY0FBQSxDQUFBLEtBQUEsQ0FBQSxLQUFBLEdBQUEsQ0FBQSxDQUFBLENBQUEsTUFBQSxDQUFBLE9BQUEsQ0FBQSxHQUFBLEVBQUEsQ0FBQSxDQUFBLE1BQUEsQ0FBQSxPQUFBLENBQUEsR0FBQSxDQUFBLENBQUE7S0FDQSxDQUFBLENBQUE7O0FBRUEsUUFBQSxNQUFBLENBQUEsUUFBQSxFQUFBO0FBQ0EsZ0JBQUEsQ0FBQSxNQUFBLEVBQUEsQ0FBQSxFQUFBLENBQUEsZUFBQSxFQUFBLFVBQUEsQ0FBQSxFQUFBO0FBQ0Esb0JBQUEsQ0FBQSxPQUFBLENBQUEsQ0FBQSxDQUFBLENBQUEsUUFBQSxFQUFBLENBQUEsQ0FBQSxTQUFBLENBQUEsRUFBQSxFQUFBLENBQUEsQ0FBQTtBQUNBLGtCQUFBLENBQUEsU0FBQSxDQUFBLENBQUEsQ0FBQSxDQUFBLFFBQUEsRUFBQSxDQUFBLENBQUEsU0FBQSxDQUFBLENBQUEsQ0FBQTtBQUNBLGtCQUFBLENBQUEsS0FBQSxDQUFBLEtBQUEsR0FBQSxDQUFBLENBQUEsQ0FBQSxRQUFBLEVBQUEsQ0FBQSxDQUFBLFNBQUEsQ0FBQSxDQUFBO1NBQ0EsQ0FBQSxDQUFBO0tBQ0E7Q0FFQSxDQUFBLENBQUE7QUMxSEEsR0FBQSxDQUFBLE1BQUEsQ0FBQSxVQUFBLGNBQUEsRUFBQTtBQUNBLGtCQUFBLENBQUEsS0FBQSxDQUFBLGtCQUFBLEVBQUE7QUFDQSxXQUFBLEVBQUEseUJBQUE7QUFDQSxtQkFBQSxFQUFBLDZDQUFBO0FBQ0Esa0JBQUEsRUFBQSxtQkFBQTtBQUNBLGVBQUEsRUFBQTtBQUNBLGlCQUFBLEVBQUEsZUFBQSxZQUFBLEVBQUEsWUFBQSxFQUFBO0FBQ0EsdUJBQUEsWUFBQSxDQUFBLEVBQUEsS0FBQSxFQUFBLEdBQ0EsWUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsRUFBQSxDQUFBLEdBQ0EsU0FBQSxDQUFBO2FBQ0E7U0FDQTtBQUNBLFlBQUEsRUFBQTtBQUNBLHdCQUFBLEVBQUEsSUFBQTtTQUNBO0tBQ0EsQ0FBQSxDQUFBO0NBQ0EsQ0FBQSxDQUFBOztBQUdBLEdBQUEsQ0FBQSxVQUFBLENBQUEsbUJBQUEsRUFBQSxVQUFBLFlBQUEsRUFBQSxNQUFBLEVBQUEsTUFBQSxFQUFBLFVBQUEsRUFBQSxLQUFBLEVBQUEsWUFBQSxFQUFBO0FBQ0EsVUFBQSxDQUFBLEtBQUEsR0FBQSxLQUFBLENBQUE7QUFDQSxjQUFBLENBQUEsYUFBQSxHQUFBLEtBQUEsQ0FBQTtBQUNBLFVBQUEsQ0FBQSxPQUFBLEdBQUEsSUFBQSxDQUFBOzs7QUFHQSxVQUFBLENBQUEsT0FBQSxHQUFBO0FBQ0EsWUFBQSxFQUFBLFVBQUE7QUFDQSxvQkFBQSxFQUFBO0FBQ0Esa0JBQUEsRUFBQSxFQUFBO0FBQ0Esa0JBQUEsRUFBQSxJQUFBO1NBQ0E7S0FDQSxDQUFBOztBQUVBLFFBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsTUFBQSxHQUFBLENBQUEsRUFBQTtBQUNBLGNBQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLE9BQUEsQ0FBQSxVQUFBLElBQUEsRUFBQSxLQUFBLEVBQUE7QUFDQSxnQkFBQSxJQUFBLENBQUEsR0FBQSxLQUFBLFlBQUEsQ0FBQSxXQUFBLEVBQUE7QUFDQSxzQkFBQSxDQUFBLEtBQUEsQ0FBQSxHQUFBLEdBQUEsS0FBQSxDQUFBO2FBQ0E7U0FDQSxDQUFBLENBQUE7O0FBRUEsY0FBQSxDQUFBLFdBQUEsR0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLEdBQUEsQ0FBQSxDQUFBO0tBQ0EsTUFBQTtBQUNBLGNBQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLElBQUEsQ0FBQSxNQUFBLENBQUEsT0FBQSxDQUFBLENBQUE7QUFDQSxjQUFBLENBQUEsV0FBQSxHQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLENBQUEsQ0FBQSxDQUFBO0tBQ0E7O0FBRUEsVUFBQSxDQUFBLFVBQUEsR0FBQSxVQUFBLFdBQUEsRUFBQTtBQUNBLG9CQUFBLENBQUEsSUFBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsWUFBQTs7QUFFQSxrQkFBQSxDQUFBLEVBQUEsQ0FBQSxrQkFBQSxFQUFBLEVBQUEsV0FBQSxFQUFBLFdBQUEsQ0FBQSxHQUFBLEVBQUEsQ0FBQSxDQUFBO1NBQ0EsQ0FBQSxDQUFBO0tBQ0EsQ0FBQTtBQUNBLFVBQUEsQ0FBQSxjQUFBLEdBQUEsWUFBQTs7QUFFQSxvQkFBQSxDQUFBLElBQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFVBQUEsWUFBQSxFQUFBO0FBQ0Esa0JBQUEsQ0FBQSxLQUFBLEdBQUEsWUFBQSxDQUFBO0FBQ0Esa0JBQUEsQ0FBQSxFQUFBLENBQUEsUUFBQSxFQUFBLEVBQUEsRUFBQSxFQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsR0FBQSxFQUFBLEVBQUEsRUFBQSxNQUFBLEVBQUEsSUFBQSxFQUFBLENBQUEsQ0FBQTtTQUNBLENBQUEsQ0FBQTtLQUNBLENBQUE7QUFDQSxVQUFBLENBQUEsbUJBQUEsR0FBQSxZQUFBO0FBQ0EsY0FBQSxDQUFBLEVBQUEsQ0FBQSxRQUFBLEVBQUEsRUFBQSxFQUFBLEVBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxHQUFBLEVBQUEsRUFBQSxFQUFBLE1BQUEsRUFBQSxJQUFBLEVBQUEsQ0FBQSxDQUFBO0tBQ0EsQ0FBQTtBQUNBLFVBQUEsQ0FBQSxZQUFBLEdBQUEsWUFBQTtBQUNBLGNBQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLElBQUEsQ0FBQSxNQUFBLENBQUEsT0FBQSxDQUFBLENBQUE7QUFDQSxlQUFBLFlBQUEsQ0FBQSxJQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxVQUFBLFlBQUEsRUFBQTtBQUNBLGtCQUFBLENBQUEsS0FBQSxHQUFBLFlBQUEsQ0FBQTtBQUNBLGtCQUFBLENBQUEsRUFBQSxDQUFBLGtCQUFBLEVBQUEsRUFBQSxXQUFBLEVBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsTUFBQSxHQUFBLENBQUEsQ0FBQSxDQUFBLEdBQUEsRUFBQSxDQUFBLENBQUE7U0FDQSxDQUFBLENBQUE7S0FFQSxDQUFBO0FBQ0EsVUFBQSxDQUFBLGVBQUEsR0FBQSxZQUFBO0FBQ0EsWUFBQSxLQUFBLEdBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsT0FBQSxDQUFBLE1BQUEsQ0FBQSxXQUFBLENBQUEsQ0FBQTtBQUNBLGNBQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLEVBQUEsQ0FBQSxDQUFBLENBQUE7QUFDQSxZQUFBLEtBQUEsS0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxNQUFBLEVBQUEsS0FBQSxFQUFBLENBQUE7QUFDQSxlQUFBLFlBQUEsQ0FBQSxJQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxVQUFBLFlBQUEsRUFBQTtBQUNBLGtCQUFBLENBQUEsS0FBQSxHQUFBLFlBQUEsQ0FBQTtBQUNBLGdCQUFBLGVBQUEsR0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxNQUFBLEtBQUEsQ0FBQSxHQUFBLElBQUEsR0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxLQUFBLENBQUEsQ0FBQSxHQUFBLENBQUE7QUFDQSxrQkFBQSxDQUFBLEVBQUEsQ0FBQSxrQkFBQSxFQUFBLEVBQUEsV0FBQSxFQUFBLGVBQUEsRUFBQSxFQUFBLEVBQUEsTUFBQSxFQUFBLElBQUEsRUFBQSxDQUFBLENBQUE7U0FDQSxDQUFBLENBQUE7S0FDQSxDQUFBOzs7QUFHQSxRQUFBLE9BQUEsR0FBQSxTQUFBLE9BQUEsR0FBQTs7QUFFQSxZQUFBLE1BQUEsQ0FBQSxXQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsQ0FBQSxNQUFBLEtBQUEsQ0FBQSxFQUFBO0FBQ0EsbUJBQUEsTUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxDQUFBO1NBQ0EsTUFBQTtBQUNBLG1CQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsS0FBQSxDQUFBO1NBQ0E7S0FDQSxDQUFBOztBQUVBLFFBQUEsWUFBQSxHQUFBLENBQUEsQ0FBQSxHQUFBLENBQUEsZ0JBQUEsQ0FBQSxDQUFBLE9BQUEsQ0FBQSxPQUFBLEVBQUEsRUFBQSxFQUFBLENBQUEsQ0FBQTs7QUFFQSxLQUFBLENBQUEsU0FBQSxDQUFBLGlGQUFBLEVBQUE7QUFDQSxlQUFBLEVBQUEsRUFBQTtBQUNBLFVBQUEsRUFBQSxvQkFBQTtBQUNBLG1CQUFBLEVBQUEsOEZBQUE7S0FDQSxDQUFBLENBQUEsS0FBQSxDQUFBLFlBQUEsQ0FBQSxDQUFBOzs7QUFHQSxRQUFBLFVBQUEsR0FBQSxJQUFBLENBQUEsQ0FBQSxZQUFBLEVBQUEsQ0FBQTtBQUNBLGdCQUFBLENBQUEsUUFBQSxDQUFBLFVBQUEsQ0FBQSxDQUFBOzs7QUFHQSxRQUFBLFdBQUEsR0FBQSxJQUFBLENBQUEsQ0FBQSxPQUFBLENBQUEsSUFBQSxDQUFBO0FBQ0EsWUFBQSxFQUFBO0FBQ0Esb0JBQUEsRUFBQSxLQUFBO0FBQ0EsbUJBQUEsRUFBQSxLQUFBO0FBQ0EscUJBQUEsRUFBQSxLQUFBO0FBQ0Esa0JBQUEsRUFBQSxLQUFBO1NBQ0E7QUFDQSxZQUFBLEVBQUE7QUFDQSx3QkFBQSxFQUFBLFVBQUE7U0FDQTtLQUNBLENBQUEsQ0FBQTtBQUNBLGdCQUFBLENBQUEsVUFBQSxDQUFBLFdBQUEsQ0FBQSxDQUFBOztBQUVBLFFBQUEsTUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxDQUFBLE1BQUEsS0FBQSxDQUFBLEVBQUE7QUFDQSxZQUFBLGFBQUEsR0FBQSxDQUFBLENBQUEsTUFBQSxDQUFBLE1BQUEsQ0FBQSxXQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsRUFBQSxNQUFBLENBQUEsV0FBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQTtBQUNBLG9CQUFBLENBQUEsUUFBQSxDQUFBLGFBQUEsQ0FBQSxDQUFBO0tBQ0E7QUFDQSxRQUFBLE1BQUEsQ0FBQTtBQUNBLGdCQUFBLENBQUEsRUFBQSxDQUFBLGNBQUEsRUFBQSxVQUFBLENBQUEsRUFBQTs7QUFFQSxZQUFBLGFBQUEsRUFBQSxZQUFBLENBQUEsV0FBQSxDQUFBLGFBQUEsQ0FBQSxDQUFBO0FBQ0EsWUFBQSxNQUFBLEVBQUEsWUFBQSxDQUFBLFdBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQTtBQUNBLFlBQUEsSUFBQSxHQUFBLENBQUEsQ0FBQSxTQUFBLENBQUE7QUFDQSxZQUFBLEtBQUEsR0FBQSxDQUFBLENBQUEsS0FBQSxDQUFBOztBQUVBLGNBQUEsQ0FBQSxXQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsR0FBQSxDQUFBLEtBQUEsQ0FBQSxPQUFBLENBQUEsR0FBQSxFQUFBLEtBQUEsQ0FBQSxPQUFBLENBQUEsR0FBQSxDQUFBLENBQUE7QUFDQSxjQUFBLENBQUEsV0FBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLEdBQUEsS0FBQSxDQUFBLFFBQUEsQ0FBQTs7QUFFQSxjQUFBLEdBQUEsQ0FBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBLEtBQUEsQ0FBQSxPQUFBLENBQUEsR0FBQSxFQUFBLEtBQUEsQ0FBQSxPQUFBLENBQUEsR0FBQSxDQUFBLEVBQUEsS0FBQSxDQUFBLFFBQUEsQ0FBQSxDQUFBO0FBQ0Esb0JBQUEsQ0FBQSxRQUFBLENBQUEsTUFBQSxDQUFBLENBQUE7S0FDQSxDQUFBLENBQUE7O0FBRUEsVUFBQSxDQUFBLGtCQUFBLEdBQUEsWUFBQTtBQUNBLFlBQUEsTUFBQSxDQUFBLFdBQUEsQ0FBQSxjQUFBLENBQUEsUUFBQSxDQUFBLE1BQUEsRUFBQSxPQUFBLFNBQUEsQ0FBQTtBQUNBLGVBQUEsU0FBQSxDQUFBO0tBQ0EsQ0FBQTtDQUNBLENBQUEsQ0FBQTs7QUNoSkEsR0FBQSxDQUFBLE1BQUEsQ0FBQSxVQUFBLGNBQUEsRUFBQTtBQUNBLGtCQUFBLENBQUEsS0FBQSxDQUFBLFdBQUEsRUFBQTtBQUNBLFdBQUEsRUFBQSxvQkFBQTtBQUNBLG1CQUFBLEVBQUEsa0NBQUE7QUFDQSxrQkFBQSxFQUFBLFVBQUE7QUFDQSxlQUFBLEVBQUE7QUFDQSxzQkFBQSxFQUFBLG9CQUFBLFlBQUEsRUFBQSxZQUFBLEVBQUE7QUFDQSx1QkFBQSxZQUFBLENBQUEsYUFBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQTthQUNBO1NBQ0E7QUFDQSxZQUFBLEVBQUE7QUFDQSx3QkFBQSxFQUFBLElBQUE7U0FDQTtLQUNBLENBQUEsQ0FBQTtDQUNBLENBQUEsQ0FBQTs7QUFFQSxHQUFBLENBQUEsVUFBQSxDQUFBLFVBQUEsRUFBQSxVQUFBLE1BQUEsRUFBQSxNQUFBLEVBQUEsVUFBQSxFQUFBLE9BQUEsRUFBQSxZQUFBLEVBQUE7QUFDQSxVQUFBLENBQUEsU0FBQSxHQUFBLElBQUEsQ0FBQTtBQUNBLFVBQUEsQ0FBQSxNQUFBLEdBQUEsRUFBQSxDQUFBO0FBQ0EsVUFBQSxDQUFBLE1BQUEsR0FBQSxVQUFBLENBQUEsR0FBQSxDQUFBLFVBQUEsQ0FBQSxFQUFBO0FBQ0EsU0FBQSxDQUFBLFVBQUEsR0FBQSxLQUFBLENBQUE7QUFDQSxlQUFBLENBQUEsQ0FBQTtLQUNBLENBQUEsQ0FBQTs7QUFFQSxVQUFBLENBQUEsVUFBQSxHQUFBLFVBQUEsWUFBQSxFQUFBO0FBQ0EsY0FBQSxDQUFBLEVBQUEsQ0FBQSxRQUFBLEVBQUEsRUFBQSxFQUFBLEVBQUEsWUFBQSxDQUFBLEdBQUEsRUFBQSxFQUFBLEVBQUEsTUFBQSxFQUFBLElBQUEsRUFBQSxDQUFBLENBQUE7S0FDQSxDQUFBO0FBQ0EsVUFBQSxDQUFBLFdBQUEsR0FBQSxVQUFBLFlBQUEsRUFBQTtBQUNBLGVBQUEsWUFBQSxVQUFBLENBQUEsWUFBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFVBQUEsWUFBQSxFQUFBO0FBQ0Esa0JBQUEsQ0FBQSxFQUFBLENBQUEsV0FBQSxFQUFBLEVBQUEsTUFBQSxFQUFBLE9BQUEsQ0FBQSxJQUFBLENBQUEsR0FBQSxFQUFBLEVBQUEsRUFBQSxNQUFBLEVBQUEsSUFBQSxFQUFBLENBQUEsQ0FBQTtTQUNBLENBQUEsQ0FBQTtLQUNBLENBQUE7QUFDQSxVQUFBLENBQUEsV0FBQSxHQUFBLFVBQUEsS0FBQSxFQUFBO0FBQ0EsWUFBQSxLQUFBLEdBQUEsTUFBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsQ0FBQTtBQUNBLGFBQUEsQ0FBQSxVQUFBLEdBQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBO0tBQ0EsQ0FBQTtBQUNBLFVBQUEsQ0FBQSxZQUFBLEdBQUEsVUFBQSxZQUFBLEVBQUE7QUFDQSxvQkFBQSxDQUFBLElBQUEsQ0FBQSxZQUFBLENBQUEsQ0FBQTtLQUNBLENBQUE7Q0FDQSxDQUFBLENBQUE7O0FDeENBLEdBQUEsQ0FBQSxPQUFBLENBQUEsY0FBQSxFQUFBLFVBQUEsS0FBQSxFQUFBLE9BQUEsRUFBQTs7QUFFQSxXQUFBOztBQUVBLG9CQUFBLEVBQUEsd0JBQUE7QUFDQSxtQkFBQSxLQUFBLENBQUEsR0FBQSxDQUFBLGFBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxVQUFBLEdBQUEsRUFBQTtBQUNBLHVCQUFBLEdBQUEsQ0FBQSxJQUFBLENBQUE7YUFDQSxDQUFBLENBQUE7U0FDQTtBQUNBLG1CQUFBLEVBQUEscUJBQUEsT0FBQSxFQUFBO0FBQ0EsbUJBQUEsS0FBQSxDQUFBLEdBQUEsQ0FBQSxjQUFBLEdBQUEsT0FBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFVBQUEsR0FBQSxFQUFBO0FBQ0EsdUJBQUEsR0FBQSxDQUFBLElBQUEsQ0FBQTthQUNBLENBQUEsQ0FBQTtTQUNBO0FBQ0EscUJBQUEsRUFBQSx1QkFBQSxNQUFBLEVBQUE7QUFDQSxtQkFBQSxLQUFBLENBQUEsR0FBQSxDQUFBLHlCQUFBLEdBQUEsTUFBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFVBQUEsR0FBQSxFQUFBO0FBQ0EsdUJBQUEsR0FBQSxDQUFBLElBQUEsQ0FBQTthQUNBLENBQUEsQ0FBQTtTQUNBO0FBQ0EsWUFBQSxFQUFBLGNBQUEsS0FBQSxFQUFBO0FBQ0EsbUJBQUEsS0FBQSxDQUFBLEdBQUEsQ0FBQSxjQUFBLEdBQUEsS0FBQSxDQUFBLEdBQUEsRUFBQSxLQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsVUFBQSxHQUFBLEVBQUE7QUFDQSx1QkFBQSxHQUFBLENBQUEsSUFBQSxDQUFBO2FBQ0EsQ0FBQSxDQUFBO1NBQ0E7QUFDQSxlQUFBLEVBQUEsaUJBQUEsS0FBQSxFQUFBO0FBQ0EsaUJBQUEsQ0FBQSxNQUFBLEdBQUEsT0FBQSxDQUFBLElBQUEsQ0FBQSxHQUFBLENBQUE7QUFDQSxtQkFBQSxLQUFBLENBQUEsSUFBQSxDQUFBLGNBQUEsRUFBQSxLQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsVUFBQSxHQUFBLEVBQUE7QUFDQSx1QkFBQSxHQUFBLENBQUEsSUFBQSxDQUFBO2FBQ0EsQ0FBQSxDQUFBO1NBQ0E7QUFDQSxrQkFBQSxpQkFBQSxLQUFBLEVBQUE7QUFDQSxtQkFBQSxLQUFBLFVBQUEsQ0FBQSxjQUFBLEdBQUEsS0FBQSxDQUFBLEdBQUEsQ0FBQSxDQUFBO1NBQ0E7S0FDQSxDQUFBO0NBQ0EsQ0FBQSxDQUFBOztBQ3ZDQSxHQUFBLENBQUEsU0FBQSxDQUFBLFFBQUEsRUFBQSxVQUFBLFVBQUEsRUFBQSxXQUFBLEVBQUEsV0FBQSxFQUFBLE1BQUEsRUFBQTs7QUFFQSxXQUFBO0FBQ0EsZ0JBQUEsRUFBQSxHQUFBO0FBQ0EsYUFBQSxFQUFBO0FBQ0EsZ0JBQUEsRUFBQSxHQUFBO0FBQ0EscUJBQUEsRUFBQSxHQUFBO1NBQ0E7QUFDQSxtQkFBQSxFQUFBLHlDQUFBO0FBQ0EsWUFBQSxFQUFBLGNBQUEsS0FBQSxFQUFBOztBQUVBLGlCQUFBLENBQUEsS0FBQSxHQUFBLENBQ0EsRUFBQSxLQUFBLEVBQUEsV0FBQSxFQUFBLEtBQUEsRUFBQSxNQUFBLEVBQUEsSUFBQSxFQUFBLElBQUEsRUFBQSxFQUNBLEVBQUEsS0FBQSxFQUFBLFdBQUEsRUFBQSxLQUFBLEVBQUEsUUFBQSxFQUFBLElBQUEsRUFBQSxJQUFBLEVBQUEsQ0FDQSxDQUFBOztBQUVBLGlCQUFBLENBQUEsSUFBQSxHQUFBLElBQUEsQ0FBQTs7QUFFQSxpQkFBQSxDQUFBLFVBQUEsR0FBQSxZQUFBO0FBQ0EsdUJBQUEsV0FBQSxDQUFBLGVBQUEsRUFBQSxDQUFBO2FBQ0EsQ0FBQTs7QUFFQSxpQkFBQSxDQUFBLE1BQUEsR0FBQSxZQUFBO0FBQ0EsMkJBQUEsQ0FBQSxNQUFBLEVBQUEsQ0FBQSxJQUFBLENBQUEsWUFBQTtBQUNBLDBCQUFBLENBQUEsRUFBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBO2lCQUNBLENBQUEsQ0FBQTthQUNBLENBQUE7O0FBRUEsZ0JBQUEsT0FBQSxHQUFBLFNBQUEsT0FBQSxHQUFBO0FBQ0EsMkJBQUEsQ0FBQSxlQUFBLEVBQUEsQ0FBQSxJQUFBLENBQUEsVUFBQSxJQUFBLEVBQUE7QUFDQSx5QkFBQSxDQUFBLElBQUEsR0FBQSxJQUFBLENBQUE7aUJBQ0EsQ0FBQSxDQUFBO2FBQ0EsQ0FBQTs7QUFFQSxnQkFBQSxVQUFBLEdBQUEsU0FBQSxVQUFBLEdBQUE7QUFDQSxxQkFBQSxDQUFBLElBQUEsR0FBQSxJQUFBLENBQUE7YUFDQSxDQUFBOztBQUVBLG1CQUFBLEVBQUEsQ0FBQTs7QUFFQSxzQkFBQSxDQUFBLEdBQUEsQ0FBQSxXQUFBLENBQUEsWUFBQSxFQUFBLE9BQUEsQ0FBQSxDQUFBO0FBQ0Esc0JBQUEsQ0FBQSxHQUFBLENBQUEsV0FBQSxDQUFBLGFBQUEsRUFBQSxVQUFBLENBQUEsQ0FBQTtBQUNBLHNCQUFBLENBQUEsR0FBQSxDQUFBLFdBQUEsQ0FBQSxjQUFBLEVBQUEsVUFBQSxDQUFBLENBQUE7OztBQUdBLHNCQUFBLENBQUEsR0FBQSxDQUFBLHFCQUFBLEVBQUEsVUFBQSxLQUFBLEVBQUEsT0FBQSxFQUFBO0FBQ0Esb0JBQUEsT0FBQSxDQUFBLElBQUEsS0FBQSxNQUFBLEVBQUE7QUFDQSxxQkFBQSxDQUFBLG1CQUFBLENBQUEsQ0FBQSxRQUFBLENBQUEsa0JBQUEsQ0FBQSxDQUFBO0FBQ0EsMkJBQUEsQ0FBQSxHQUFBLENBQUEsZ0JBQUEsQ0FBQSxDQUFBO2lCQUNBLE1BQUE7QUFDQSxxQkFBQSxDQUFBLG1CQUFBLENBQUEsQ0FBQSxXQUFBLENBQUEsa0JBQUEsQ0FBQSxDQUFBO0FBQ0EsMkJBQUEsQ0FBQSxHQUFBLENBQUEsWUFBQSxDQUFBLENBQUE7aUJBQ0E7YUFDQSxDQUFBLENBQUE7OztBQUdBLGFBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQSxNQUFBLENBQUEsWUFBQTtBQUNBLG9CQUFBLENBQUEsQ0FBQSxTQUFBLENBQUEsQ0FBQSxNQUFBLEVBQUEsQ0FBQSxHQUFBLEdBQUEsRUFBQSxJQUFBLEtBQUEsQ0FBQSxJQUFBLEVBQUE7QUFDQSxxQkFBQSxDQUFBLG1CQUFBLENBQUEsQ0FBQSxRQUFBLENBQUEsa0JBQUEsQ0FBQSxDQUFBO0FBQ0EsMkJBQUEsQ0FBQSxHQUFBLENBQUEsYUFBQSxDQUFBLENBQUE7aUJBQ0EsTUFBQSxJQUFBLEtBQUEsQ0FBQSxJQUFBLEVBQUE7QUFDQSxxQkFBQSxDQUFBLG1CQUFBLENBQUEsQ0FBQSxXQUFBLENBQUEsa0JBQUEsQ0FBQSxDQUFBO0FBQ0EsMkJBQUEsQ0FBQSxHQUFBLENBQUEsVUFBQSxDQUFBLENBQUE7aUJBQ0E7YUFDQSxDQUFBLENBQUE7OztBQUdBLGFBQUEsQ0FBQSxZQUFBO0FBQ0EsaUJBQUEsQ0FBQSxnQkFBQSxDQUFBLENBQUEsSUFBQSxDQUFBLE9BQUEsRUFBQSxZQUFBO0FBQ0Esd0JBQUEsT0FBQSxHQUFBLENBQUEsQ0FBQSxJQUFBLENBQUEsQ0FBQTtBQUNBLHFCQUFBLENBQUEsWUFBQSxDQUFBLENBQUEsSUFBQSxFQUFBLENBQUEsT0FBQSxDQUFBO0FBQ0EsaUNBQUEsRUFBQSxDQUFBLENBQUEsT0FBQSxDQUFBLElBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQSxDQUFBLE1BQUEsRUFBQSxDQUFBLEdBQUE7cUJBQ0EsRUFBQSxJQUFBLEVBQUEsZUFBQSxDQUFBLENBQUE7QUFDQSx5QkFBQSxDQUFBLGNBQUEsRUFBQSxDQUFBO2lCQUNBLENBQUEsQ0FBQTthQUNBLENBQUEsQ0FBQTtTQUVBOztLQUVBLENBQUE7Q0FFQSxDQUFBLENBQUE7O0FDakZBLEdBQUEsQ0FBQSxTQUFBLENBQUEsZUFBQSxFQUFBLFlBQUE7QUFDQSxXQUFBO0FBQ0EsZ0JBQUEsRUFBQSxHQUFBO0FBQ0EsbUJBQUEsRUFBQSx5REFBQTtLQUNBLENBQUE7Q0FDQSxDQUFBLENBQUEiLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0JztcbndpbmRvdy5hcHAgPSBhbmd1bGFyLm1vZHVsZSgnR2VvUXVlc3QnLCBbJ2ZzYVByZUJ1aWx0JywgJ3VpLnJvdXRlcicsICd1aS5zb3J0YWJsZScsICd1aS5ib290c3RyYXAnLCAnbmdBbmltYXRlJywgJ2xlYWZsZXQtZGlyZWN0aXZlJ10pO1xuXG5hcHAuY29uZmlnKGZ1bmN0aW9uICgkdXJsUm91dGVyUHJvdmlkZXIsICRsb2NhdGlvblByb3ZpZGVyKSB7XG4gICAgLy8gVGhpcyB0dXJucyBvZmYgaGFzaGJhbmcgdXJscyAoLyNhYm91dCkgYW5kIGNoYW5nZXMgaXQgdG8gc29tZXRoaW5nIG5vcm1hbCAoL2Fib3V0KVxuICAgICRsb2NhdGlvblByb3ZpZGVyLmh0bWw1TW9kZSh0cnVlKTtcbiAgICAvLyBJZiB3ZSBnbyB0byBhIFVSTCB0aGF0IHVpLXJvdXRlciBkb2Vzbid0IGhhdmUgcmVnaXN0ZXJlZCwgZ28gdG8gdGhlIFwiL1wiIHVybC5cbiAgICAkdXJsUm91dGVyUHJvdmlkZXIub3RoZXJ3aXNlKCcvZGFzaGJvYXJkJyk7XG59KTtcblxuLy8gVGhpcyBhcHAucnVuIGlzIGZvciBjb250cm9sbGluZyBhY2Nlc3MgdG8gc3BlY2lmaWMgc3RhdGVzLlxuYXBwLnJ1bihmdW5jdGlvbiAoJHJvb3RTY29wZSwgQXV0aFNlcnZpY2UsICRzdGF0ZSkge1xuXG4gICAgLy8gVGhlIGdpdmVuIHN0YXRlIHJlcXVpcmVzIGFuIGF1dGhlbnRpY2F0ZWQgdXNlci5cbiAgICB2YXIgZGVzdGluYXRpb25TdGF0ZVJlcXVpcmVzQXV0aCA9IGZ1bmN0aW9uIChzdGF0ZSkge1xuICAgICAgICByZXR1cm4gc3RhdGUuZGF0YSAmJiBzdGF0ZS5kYXRhLmF1dGhlbnRpY2F0ZTtcbiAgICB9O1xuXG4gICAgLy8gJHN0YXRlQ2hhbmdlU3RhcnQgaXMgYW4gZXZlbnQgZmlyZWRcbiAgICAvLyB3aGVuZXZlciB0aGUgcHJvY2VzcyBvZiBjaGFuZ2luZyBhIHN0YXRlIGJlZ2lucy5cbiAgICAkcm9vdFNjb3BlLiRvbignJHN0YXRlQ2hhbmdlU3RhcnQnLCBmdW5jdGlvbiAoZXZlbnQsIHRvU3RhdGUsIHRvUGFyYW1zKSB7XG5cbiAgICAgICAgaWYgKCFkZXN0aW5hdGlvblN0YXRlUmVxdWlyZXNBdXRoKHRvU3RhdGUpKSB7XG4gICAgICAgICAgICAvLyBUaGUgZGVzdGluYXRpb24gc3RhdGUgZG9lcyBub3QgcmVxdWlyZSBhdXRoZW50aWNhdGlvblxuICAgICAgICAgICAgLy8gU2hvcnQgY2lyY3VpdCB3aXRoIHJldHVybi5cbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChBdXRoU2VydmljZS5pc0F1dGhlbnRpY2F0ZWQoKSkge1xuICAgICAgICAgICAgLy8gVGhlIHVzZXIgaXMgYXV0aGVudGljYXRlZC5cbiAgICAgICAgICAgIC8vIFNob3J0IGNpcmN1aXQgd2l0aCByZXR1cm4uXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDYW5jZWwgbmF2aWdhdGluZyB0byBuZXcgc3RhdGUuXG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cbiAgICAgICAgQXV0aFNlcnZpY2UuZ2V0TG9nZ2VkSW5Vc2VyKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgICAgICAgLy8gSWYgYSB1c2VyIGlzIHJldHJpZXZlZCwgdGhlbiByZW5hdmlnYXRlIHRvIHRoZSBkZXN0aW5hdGlvblxuICAgICAgICAgICAgLy8gKHRoZSBzZWNvbmQgdGltZSwgQXV0aFNlcnZpY2UuaXNBdXRoZW50aWNhdGVkKCkgd2lsbCB3b3JrKVxuICAgICAgICAgICAgLy8gb3RoZXJ3aXNlLCBpZiBubyB1c2VyIGlzIGxvZ2dlZCBpbiwgZ28gdG8gXCJsb2dpblwiIHN0YXRlLlxuICAgICAgICAgICAgaWYgKHVzZXIpIHtcbiAgICAgICAgICAgICAgICAkc3RhdGUuZ28odG9TdGF0ZS5uYW1lLCB0b1BhcmFtcyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICRzdGF0ZS5nbygnbG9naW4nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICB9KTtcblxufSk7XG4iLCIoZnVuY3Rpb24gKCkge1xuXG4gICAgJ3VzZSBzdHJpY3QnO1xuXG4gICAgLy8gSG9wZSB5b3UgZGlkbid0IGZvcmdldCBBbmd1bGFyISBEdWgtZG95LlxuICAgIGlmICghd2luZG93LmFuZ3VsYXIpIHRocm93IG5ldyBFcnJvcignSSBjYW5cXCd0IGZpbmQgQW5ndWxhciEnKTtcblxuICAgIHZhciBhcHAgPSBhbmd1bGFyLm1vZHVsZSgnZnNhUHJlQnVpbHQnLCBbXSk7XG5cbiAgICBhcHAuZmFjdG9yeSgnU29ja2V0JywgZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAoIXdpbmRvdy5pbykgdGhyb3cgbmV3IEVycm9yKCdzb2NrZXQuaW8gbm90IGZvdW5kIScpO1xuICAgICAgICByZXR1cm4gd2luZG93LmlvKHdpbmRvdy5sb2NhdGlvbi5vcmlnaW4pO1xuICAgIH0pO1xuXG4gICAgLy8gQVVUSF9FVkVOVFMgaXMgdXNlZCB0aHJvdWdob3V0IG91ciBhcHAgdG9cbiAgICAvLyBicm9hZGNhc3QgYW5kIGxpc3RlbiBmcm9tIGFuZCB0byB0aGUgJHJvb3RTY29wZVxuICAgIC8vIGZvciBpbXBvcnRhbnQgZXZlbnRzIGFib3V0IGF1dGhlbnRpY2F0aW9uIGZsb3cuXG4gICAgYXBwLmNvbnN0YW50KCdBVVRIX0VWRU5UUycsIHtcbiAgICAgICAgbG9naW5TdWNjZXNzOiAnYXV0aC1sb2dpbi1zdWNjZXNzJyxcbiAgICAgICAgbG9naW5GYWlsZWQ6ICdhdXRoLWxvZ2luLWZhaWxlZCcsXG4gICAgICAgIGxvZ291dFN1Y2Nlc3M6ICdhdXRoLWxvZ291dC1zdWNjZXNzJyxcbiAgICAgICAgc2Vzc2lvblRpbWVvdXQ6ICdhdXRoLXNlc3Npb24tdGltZW91dCcsXG4gICAgICAgIG5vdEF1dGhlbnRpY2F0ZWQ6ICdhdXRoLW5vdC1hdXRoZW50aWNhdGVkJyxcbiAgICAgICAgbm90QXV0aG9yaXplZDogJ2F1dGgtbm90LWF1dGhvcml6ZWQnXG4gICAgfSk7XG5cbiAgICBhcHAuZmFjdG9yeSgnQXV0aEludGVyY2VwdG9yJywgZnVuY3Rpb24gKCRyb290U2NvcGUsICRxLCBBVVRIX0VWRU5UUykge1xuICAgICAgICB2YXIgc3RhdHVzRGljdCA9IHtcbiAgICAgICAgICAgIDQwMTogQVVUSF9FVkVOVFMubm90QXV0aGVudGljYXRlZCxcbiAgICAgICAgICAgIDQwMzogQVVUSF9FVkVOVFMubm90QXV0aG9yaXplZCxcbiAgICAgICAgICAgIDQxOTogQVVUSF9FVkVOVFMuc2Vzc2lvblRpbWVvdXQsXG4gICAgICAgICAgICA0NDA6IEFVVEhfRVZFTlRTLnNlc3Npb25UaW1lb3V0XG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICByZXNwb25zZUVycm9yOiBmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3Qoc3RhdHVzRGljdFtyZXNwb25zZS5zdGF0dXNdLCByZXNwb25zZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuICRxLnJlamVjdChyZXNwb25zZSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICB9KTtcblxuICAgIGFwcC5jb25maWcoZnVuY3Rpb24gKCRodHRwUHJvdmlkZXIpIHtcbiAgICAgICAgJGh0dHBQcm92aWRlci5pbnRlcmNlcHRvcnMucHVzaChbXG4gICAgICAgICAgICAnJGluamVjdG9yJyxcbiAgICAgICAgICAgIGZ1bmN0aW9uICgkaW5qZWN0b3IpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gJGluamVjdG9yLmdldCgnQXV0aEludGVyY2VwdG9yJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIF0pO1xuICAgIH0pO1xuICAgIGFwcC5zZXJ2aWNlKCdBdXRoU2VydmljZScsIGZ1bmN0aW9uICgkaHR0cCwgU2Vzc2lvbiwgJHJvb3RTY29wZSwgQVVUSF9FVkVOVFMsICRxKSB7XG5cbiAgICAgICAgZnVuY3Rpb24gb25TdWNjZXNzZnVsTG9naW4ocmVzcG9uc2UpIHtcbiAgICAgICAgICAgIHZhciBkYXRhID0gcmVzcG9uc2UuZGF0YTtcbiAgICAgICAgICAgIFNlc3Npb24uY3JlYXRlKGRhdGEuaWQsIGRhdGEudXNlcik7XG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoQVVUSF9FVkVOVFMubG9naW5TdWNjZXNzKTtcbiAgICAgICAgICAgIHJldHVybiBkYXRhLnVzZXI7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBVc2VzIHRoZSBzZXNzaW9uIGZhY3RvcnkgdG8gc2VlIGlmIGFuXG4gICAgICAgIC8vIGF1dGhlbnRpY2F0ZWQgdXNlciBpcyBjdXJyZW50bHkgcmVnaXN0ZXJlZC5cbiAgICAgICAgdGhpcy5pc0F1dGhlbnRpY2F0ZWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gISFTZXNzaW9uLnVzZXI7XG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5nZXRMb2dnZWRJblVzZXIgPSBmdW5jdGlvbiAoZnJvbVNlcnZlcikge1xuXG4gICAgICAgICAgICAvLyBJZiBhbiBhdXRoZW50aWNhdGVkIHNlc3Npb24gZXhpc3RzLCB3ZVxuICAgICAgICAgICAgLy8gcmV0dXJuIHRoZSB1c2VyIGF0dGFjaGVkIHRvIHRoYXQgc2Vzc2lvblxuICAgICAgICAgICAgLy8gd2l0aCBhIHByb21pc2UuIFRoaXMgZW5zdXJlcyB0aGF0IHdlIGNhblxuICAgICAgICAgICAgLy8gYWx3YXlzIGludGVyZmFjZSB3aXRoIHRoaXMgbWV0aG9kIGFzeW5jaHJvbm91c2x5LlxuXG4gICAgICAgICAgICAvLyBPcHRpb25hbGx5LCBpZiB0cnVlIGlzIGdpdmVuIGFzIHRoZSBmcm9tU2VydmVyIHBhcmFtZXRlcixcbiAgICAgICAgICAgIC8vIHRoZW4gdGhpcyBjYWNoZWQgdmFsdWUgd2lsbCBub3QgYmUgdXNlZC5cblxuICAgICAgICAgICAgaWYgKHRoaXMuaXNBdXRoZW50aWNhdGVkKCkgJiYgZnJvbVNlcnZlciAhPT0gdHJ1ZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiAkcS53aGVuKFNlc3Npb24udXNlcik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIE1ha2UgcmVxdWVzdCBHRVQgL3Nlc3Npb24uXG4gICAgICAgICAgICAvLyBJZiBpdCByZXR1cm5zIGEgdXNlciwgY2FsbCBvblN1Y2Nlc3NmdWxMb2dpbiB3aXRoIHRoZSByZXNwb25zZS5cbiAgICAgICAgICAgIC8vIElmIGl0IHJldHVybnMgYSA0MDEgcmVzcG9uc2UsIHdlIGNhdGNoIGl0IGFuZCBpbnN0ZWFkIHJlc29sdmUgdG8gbnVsbC5cbiAgICAgICAgICAgIHJldHVybiAkaHR0cC5nZXQoJy9zZXNzaW9uJykudGhlbihvblN1Y2Nlc3NmdWxMb2dpbikuY2F0Y2goZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLmxvZ2luID0gZnVuY3Rpb24gKGNyZWRlbnRpYWxzKSB7XG4gICAgICAgICAgICByZXR1cm4gJGh0dHAucG9zdCgnL2xvZ2luJywgY3JlZGVudGlhbHMpXG4gICAgICAgICAgICAgICAgLnRoZW4ob25TdWNjZXNzZnVsTG9naW4pXG4gICAgICAgICAgICAgICAgLmNhdGNoKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICRxLnJlamVjdCh7IG1lc3NhZ2U6ICdJbnZhbGlkIGxvZ2luIGNyZWRlbnRpYWxzLicgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG4gICAgICAgIFxuXG4gICAgICAgIHRoaXMuc2lnbnVwID0gZnVuY3Rpb24gKGNyZWRlbnRpYWxzKSB7XG4gICAgICAgICAgICAvL3NlbmRzIGEgcG9zdCByZXF1ZXN0IGNvbnRhaW5pbmcgdGhlIHVzZXIncyBjcmVkZW50aWFscyB0byBcbiAgICAgICAgICAgIHJldHVybiAkaHR0cC5wb3N0KCdhcGkvdXNlcnMvc2lnbnVwJywgY3JlZGVudGlhbHMpXG4gICAgICAgICAgICAgICAgLy9vbmNlIHRoZSB1c2VyIGhhcyBiZWVuIGNyZWF0ZWQgb24gdGhlIGJhY2tlbmQuLi5cbiAgICAgICAgICAgICAgICAudGhlbihmdW5jdGlvbihyZXNwb25zZSkge1xuICAgICAgICAgICAgICAgICAgICAvL2Egc2Vjb25kIHBvc3QgcmVxdWVzdCBpcyBjcmVhdGVkIHRvIGxvZyB0aGUgdXNlciBpblxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gJGh0dHAucG9zdCgnL2xvZ2luJywgY3JlZGVudGlhbHMpO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLnRoZW4ob25TdWNjZXNzZnVsTG9naW4pXG4gICAgICAgICAgICAgICAgLmNhdGNoKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICRxLnJlamVjdCh7IG1lc3NhZ2U6ICdJbnZhbGlkIHNpZ251cCBjcmVkZW50aWFscy4nIH0pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMubG9nb3V0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuICRodHRwLmdldCgnL2xvZ291dCcpLnRoZW4oZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIFNlc3Npb24uZGVzdHJveSgpO1xuICAgICAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdChBVVRIX0VWRU5UUy5sb2dvdXRTdWNjZXNzKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuXG4gICAgfSk7XG5cbiAgICBhcHAuc2VydmljZSgnU2Vzc2lvbicsIGZ1bmN0aW9uICgkcm9vdFNjb3BlLCBBVVRIX0VWRU5UUykge1xuXG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgICAgICAkcm9vdFNjb3BlLiRvbihBVVRIX0VWRU5UUy5ub3RBdXRoZW50aWNhdGVkLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBzZWxmLmRlc3Ryb3koKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgJHJvb3RTY29wZS4kb24oQVVUSF9FVkVOVFMuc2Vzc2lvblRpbWVvdXQsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHNlbGYuZGVzdHJveSgpO1xuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLmlkID0gbnVsbDtcbiAgICAgICAgdGhpcy51c2VyID0gbnVsbDtcblxuICAgICAgICB0aGlzLmNyZWF0ZSA9IGZ1bmN0aW9uIChzZXNzaW9uSWQsIHVzZXIpIHtcbiAgICAgICAgICAgIHRoaXMuaWQgPSBzZXNzaW9uSWQ7XG4gICAgICAgICAgICB0aGlzLnVzZXIgPSB1c2VyO1xuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMuaWQgPSBudWxsO1xuICAgICAgICAgICAgdGhpcy51c2VyID0gbnVsbDtcbiAgICAgICAgfTtcblxuICAgIH0pO1xuXG59KSgpO1xuIiwiYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHN0YXRlUHJvdmlkZXIpIHtcblxuICAgICRzdGF0ZVByb3ZpZGVyLnN0YXRlKCdob21lJywge1xuICAgICAgICB1cmw6ICcvJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICdqcy9ob21lL2hvbWUuaHRtbCcsXG4gICAgICAgIGNvbnRyb2xsZXI6ICdIb21lQ3RybCcsXG4gICAgICAgIHJlc29sdmU6IHtcbiAgICAgICAgICAgIHJlcXVlc3RlZFVzZXI6IGZ1bmN0aW9uKEF1dGhTZXJ2aWNlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIEF1dGhTZXJ2aWNlLmdldExvZ2dlZEluVXNlcigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSk7XG5cbn0pO1xuXG5hcHAuY29udHJvbGxlcignSG9tZUN0cmwnLCBmdW5jdGlvbiAoJHNjb3BlLCBBdXRoU2VydmljZSwgJHN0YXRlLCByZXF1ZXN0ZWRVc2VyKSB7XG4gICAgLy8gSWYgdGhlcmUncyBhIGxvZ2dlZCBpbiB1c2VyIHVwb24gbG9hZCwgZ28gdG8gdGhlIGRhc2hib2FyZFxuICAgIGlmIChyZXF1ZXN0ZWRVc2VyKSAkc3RhdGUuZ28oJ2Rhc2hib2FyZCcsIHt1c2VySWQ6IHJlcXVlc3RlZFVzZXIuX2lkfSk7XG5cbiAgICAkc2NvcGUuaG9tZSA9IHRydWU7IC8vIFRvIGtub3cgd2hhdCBuYXYgbGlua3MgdG8gc2hvd1xuICAgICRzY29wZS5sb2dpbiA9IHt9O1xuICAgICRzY29wZS5zaWdudXAgPSB7fTtcbiAgICAkc2NvcGUubG9naW5FcnJvciA9IG51bGw7XG4gICAgJHNjb3BlLnNpZ251cEVycm9yID0gbnVsbDtcblxuICAgICRzY29wZS5zZW5kTG9naW4gPSBmdW5jdGlvbiAobG9naW5JbmZvKSB7XG4gICAgICAgICRzY29wZS5lcnJvciA9IG51bGw7XG5cbiAgICAgICAgQXV0aFNlcnZpY2UubG9naW4obG9naW5JbmZvKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgICAgICAkc3RhdGUuZ28oJ2Rhc2hib2FyZCcsIHt1c2VySWQ6IHVzZXIuX2lkfSk7XG4gICAgICAgIH0pLmNhdGNoKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICRzY29wZS5lcnJvciA9IFwiSSB0aGluayB5b3VcXCd2ZSBlbnRlcmVkIHRoZSB3cm9uZyBpbmZvLCBmcmllbmRcIjtcbiAgICAgICAgfSk7XG5cbiAgICB9O1xuXG4gICAgJHNjb3BlLnNlbmRTaWdudXAgPSBmdW5jdGlvbihzaWdudXBJbmZvKSB7XG4gICAgICAgICRzY29wZS5lcnJvciA9IG51bGw7XG4gICAgICAgIEF1dGhTZXJ2aWNlLnNpZ251cChzaWdudXBJbmZvKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgICAgICAkc3RhdGUuZ28oJ2Rhc2hib2FyZCcsIHt1c2VySWQ6IHVzZXIuX2lkfSwge3JlbG9hZDogdHJ1ZX0pO1xuICAgICAgICB9KS5jYXRjaChmdW5jdGlvbigpe1xuICAgICAgICAgICAgJHNjb3BlLmVycm9yID0gXCJJJ20gYWZyYWlkIHdlIGFscmVhZHkgaGF2ZSBzb21lb25lIGJ5IHRoYXQgbmFtZVwiO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgLy8gUGFyYWxheCBlZmZlY3QgZm9yIGltYWdlc1xuICAgICQoZnVuY3Rpb24oKSB7XG4gICAgLy8gQ2FjaGUgdGhlIHdpbmRvdyBvYmplY3QgKG1ha2VzIGxvYWQgdGltZSBmYXN0ZXIpXG4gICAgdmFyICR3aW5kb3cgPSAkKHdpbmRvdyk7XG4gICAgLy8gUGFyYWxsYXggYmFja2dyb3VuZCBlZmZlY3RcbiAgICAkKCdzZWN0aW9uW2RhdGEtdHlwZT1cImJhY2tncm91bmRcIl0nKS5lYWNoKGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgJGJnb2JqID0gJCh0aGlzKTsgLy8gYXNzaWduaW5nIHRoZSBvYmplY3RcbiAgICAgICAgJCh3aW5kb3cpLnNjcm9sbChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIC8vc2Nyb2xsIHRoZSBiYWNrZ3JvdW5kIGF0IHZhciBzcGVlZFxuICAgICAgICAgICAgLy8gdGhlIHlQb3MgaXMgYSBuZWdhdGl2ZSBiZWNhdXNlIHdlJ3JlIHNjcm9sbGluZyBpdCB1cFxuICAgICAgICAgICAgdmFyIHlQb3MgPSAtKCR3aW5kb3cuc2Nyb2xsVG9wKCkgLyAkYmdvYmouZGF0YSgnc3BlZWQnKSk7XG4gICAgICAgICAgICAvLyBQdXQgdG9nZXRoZXIgb3VyIGZpbmFsIGJhY2tncm91bmQgcG9zaXRpb25cbiAgICAgICAgICAgIHZhciBjb29yZHMgPSAnNTAlICcgKyB5UG9zICsgJ3B4JztcbiAgICAgICAgICAgIC8vIE1vdmUgdGhlIGJhY2tncm91bmRcbiAgICAgICAgICAgICRiZ29iai5jc3MoeyBiYWNrZ3JvdW5kUG9zaXRpb246IGNvb3JkcyB9KTtcbiAgICAgICAgfSk7IC8vIGVuZCB3aW5kb3cgc2Nyb2xsXG4gICAgfSk7XG59KTtcblxuXG5cbn0pOyIsImFwcC5jb25maWcoZnVuY3Rpb24gKCRzdGF0ZVByb3ZpZGVyKXtcblx0JHN0YXRlUHJvdmlkZXIuc3RhdGUoJ2VkaXRvcicsXG5cdFx0e1xuXHRcdFx0dXJsOiAnL2VkaXRvci86aWQnLFxuXHRcdFx0dGVtcGxhdGVVcmw6ICdqcy9xdWVzdC1lZGl0b3IvZWRpdG9yLmh0bWwnLFxuXHRcdFx0Y29udHJvbGxlcjogJ0VkaXRvckN0cmwnLFxuXHRcdCAgICByZXNvbHZlOiB7XG5cdFx0ICAgIFx0cXVlc3Q6IGZ1bmN0aW9uKFF1ZXN0RmFjdG9yeSwgJHN0YXRlUGFyYW1zKXtcblx0XHQgICAgXHRcdHJldHVybiAkc3RhdGVQYXJhbXMuaWQgIT09IFwiXCIgP1xuXHRcdFx0XHRcdFx0UXVlc3RGYWN0b3J5LmdldE9uZVF1ZXN0KCRzdGF0ZVBhcmFtcy5pZCkgOiBcblx0XHRcdFx0XHRcdHVuZGVmaW5lZDtcblx0XHQgICAgXHR9XG5cdFx0ICAgIH0sXG5cdFx0XHRkYXRhOiB7XG5cdCAgICAgICAgYXV0aGVudGljYXRlOiB0cnVlXG5cdCAgICB9XG5cdH0pO1xufSk7XG5cbmFwcC5jb250cm9sbGVyKCdFZGl0b3JDdHJsJywgZnVuY3Rpb24gKCRzY29wZSwgJHN0YXRlUGFyYW1zLCAkdWliTW9kYWwsICRzdGF0ZSwgJHJvb3RTY29wZSwgcXVlc3QsIFNlc3Npb24sIFF1ZXN0RmFjdG9yeSkge1xuXHQvL3ZhcmlhYmxlIHNhdmVkIHRvIHNob3cvaGlkZSBxdWVzdCBlZGl0b3Igd2hlbiBlZGl0aW5nIGluZGl2aWR1YWwgc3RhdGVzXG5cdCRyb290U2NvcGUuZWRpdG9yVmlzaWJsZSA9IHRydWU7XG5cdCRzY29wZS5xdWVzdCA9IHF1ZXN0O1xuXHQkc2NvcGUudmlld01haW5NYXAgPSB0cnVlO1xuXHQkc2NvcGUubmV3UXVlc3QgPSBmYWxzZTtcblx0Ly9pZiB0aGVyZSBpcyBubyBuZXcgcXVlc3QsIHNldCBwcm9wZXJ0aWVzIFxuXHRpZighcXVlc3QpIHtcblx0XHQkc2NvcGUubmV3UXVlc3QgPSB0cnVlO1xuXHRcdCRzY29wZS5xdWVzdD0ge1xuXHRcdFx0c3RhcnQ6ICBbNDAuNzIzMDA4LC03NC4wMDA2MzI3XVxuXHRcdH07XG5cdH1cblxuXHQvL3VwZGF0ZSBxdWVzdCBhbmQgZ28gdG8gZGFzaGJvYXJkIGZvciBjdXJyZW50IHVzZXJcblx0JHNjb3BlLnNhdmVRdWVzdCA9IGZ1bmN0aW9uICgpIHtcblx0XHRpZighJHNjb3BlLm5ld1F1ZXN0KSB7XG5cdFx0XHRyZXR1cm4gUXVlc3RGYWN0b3J5LnNhdmUoJHNjb3BlLnF1ZXN0KVx0XHRcblx0XHRcdC50aGVuKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0JHN0YXRlLmdvKCdkYXNoYm9hcmQnLCB7dXNlcklkOiBTZXNzaW9uLnVzZXIuX2lkfSk7XG5cdFx0XHR9KVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gUXVlc3RGYWN0b3J5LnNhdmVOZXcoJHNjb3BlLnF1ZXN0KVxuXHRcdFx0LnRoZW4oZnVuY3Rpb24gKCkge1xuXHRcdFx0XHQkc3RhdGUuZ28oJ2Rhc2hib2FyZCcsIHt1c2VySWQ6IFNlc3Npb24udXNlci5faWR9KTtcblx0XHRcdH0pXG5cdFx0fVxuXHR9O1xuXHQvL2dvIHRvIG1hcFN0YXRlcyBlZGl0b3IgYW5kIGhpZGUgUXVlc3QgZWRpdG9yIFxuXHQkc2NvcGUudHJhbnNpdGlvblRvTWFwU3RhdGVFZGl0b3IgPSBmdW5jdGlvbiAoKSB7XG5cdFx0aWYoISRzY29wZS5uZXdRdWVzdCkge1xuXHRcdFx0cmV0dXJuIFF1ZXN0RmFjdG9yeS5zYXZlKCRzY29wZS5xdWVzdClcblx0XHRcdC50aGVuKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0aWYoJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0JHN0YXRlLmdvKCdlZGl0b3IucXVlc3RTdGVwJywge3F1ZXN0U3RlcElkOiBudWxsfSk7XG5cdFx0XHRcdH0gZWxzZSB7IFxuXHRcdFx0XHRcdCRzdGF0ZS5nbygnZWRpdG9yLnF1ZXN0U3RlcCcsIHtxdWVzdFN0ZXBJZDogJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHNbMF0uX2lkfSk7XHRcblx0XHRcdFx0fVxuXHRcdFx0XHQkc2NvcGUuZWRpdG9yVmlzaWJsZSA9IGZhbHNlO1xuXHRcdFx0fSlcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIFF1ZXN0RmFjdG9yeS5zYXZlTmV3KCRzY29wZS5xdWVzdClcblx0XHRcdC50aGVuKGZ1bmN0aW9uIChzYXZlZFF1ZXN0KSB7XG5cdFx0XHRcdCRzY29wZS5lZGl0b3JWaXNpYmxlID0gZmFsc2U7XG5cdFx0XHRcdCRzdGF0ZS5nbygnZWRpdG9yLnF1ZXN0U3RlcCcsIHtpZDogc2F2ZWRRdWVzdC5faWQsIHF1ZXN0U3RlcElkOiBudWxsfSk7XG5cdFx0XHR9KVxuXHRcdH1cblx0fTtcblxuXHQvLyoqKioqKioqKioqICBNQVAgRlVOQ1RJT05TIEJFTE9XICAqKioqKioqKioqKioqKioqKioqKioqKlxuXHRcdHZhciBxdWVzdE1hcCA9IEwubWFwKCdxdWVzdC1tYXAnKS5zZXRWaWV3KCRzY29wZS5xdWVzdC5zdGFydCwgMTMpO1xuXG5cdFx0TC50aWxlTGF5ZXIoJ2h0dHBzOi8vYXBpLnRpbGVzLm1hcGJveC5jb20vdjQve2lkfS97en0ve3h9L3t5fS5wbmc/YWNjZXNzX3Rva2VuPXthY2Nlc3NUb2tlbn0nLCB7XG5cdCAgICBtYXhab29tOiAxOCxcblx0ICAgIGlkOiAnc2NvdHRlZ2dzLm83NjE0amwyJyxcblx0ICAgIGFjY2Vzc1Rva2VuOiAncGsuZXlKMUlqb2ljMk52ZEhSbFoyZHpJaXdpWVNJNkltTnBhRFpvWnpobWRqQmpNRFoxY1dvNWFHY3lhWGx0ZVRraWZRLkxaZTAtSUJSUW1aMFBrUUJzWUlsaXcnXG5cdFx0fSkuYWRkVG8ocXVlc3RNYXApO1xuXG5cdFx0dmFyIGRyYXduSXRlbXMgPSBuZXcgTC5GZWF0dXJlR3JvdXAoKTtcblx0XHRxdWVzdE1hcC5hZGRMYXllcihkcmF3bkl0ZW1zKTtcdFxuXG5cdFx0Ly8gSW5pdGlhbGlzZSB0aGUgZHJhdyBjb250cm9sIGFuZCBwYXNzIGl0IHRoZSBGZWF0dXJlR3JvdXAgb2YgZWRpdGFibGUgbGF5ZXJzXG5cdFx0dmFyIGRyYXdDb250cm9sID0gbmV3IEwuQ29udHJvbC5EcmF3KHtcblx0XHQgICAgZHJhdzoge1xuXHRcdCAgICBcdHBvbHlsaW5lOiBmYWxzZSxcblx0XHQgICAgXHRwb2x5Z29uOiBmYWxzZSxcblx0XHQgICAgXHRyZWN0YW5nbGU6IGZhbHNlLFxuXHRcdCAgICBcdGNpcmNsZTogZmFsc2Vcblx0XHQgICAgfSxcblx0XHQgICAgZWRpdDoge1xuXHRcdCAgICAgICAgZmVhdHVyZUdyb3VwOiBkcmF3bkl0ZW1zXG5cdFx0ICAgIH1cblx0XHR9KTtcblxuXHRcdHF1ZXN0TWFwLmFkZENvbnRyb2woZHJhd0NvbnRyb2wpO1xuXG5cdFx0dmFyIG1hcmtlciA9IEwubWFya2VyKCRzY29wZS5xdWVzdC5zdGFydCwge2RyYWdnYWJsZTogdHJ1ZX0pO1xuXHRcdHF1ZXN0TWFwLmFkZExheWVyKG1hcmtlcik7XG5cblx0XHRxdWVzdE1hcC5vbignZHJhdzpjcmVhdGVkJywgZnVuY3Rpb24gKGUpIHtcblx0XHRcdC8vXHRyZW1vdmUgYW55IGV4aXN0aW5nIG1hcmtlcnNcblx0XHQgIGlmIChtYXJrZXIpIHF1ZXN0TWFwLnJlbW92ZUxheWVyKG1hcmtlcik7XG5cdFx0ICB2YXIgdHlwZSA9IGUubGF5ZXJUeXBlO1xuXHRcdCAgdmFyIGxheWVyID0gZS5sYXllcjtcblx0XHQgIC8vc2F2ZSBzdGFydCBsb2NhdGlvbiBvZiBuZXcgbWFya2VyXG5cdFx0ICAkc2NvcGUucXVlc3Quc3RhcnQgPSBbbGF5ZXIuX2xhdGxuZy5sYXQsbGF5ZXIuX2xhdGxuZy5sbmddO1xuXHRcdCAgLy9jcmVhdGUgbWFya2VyIGFuZCBhZGQgdG8gbWFwXG5cdFx0ICBtYXJrZXIgPSBMLm1hcmtlcihbbGF5ZXIuX2xhdGxuZy5sYXQsbGF5ZXIuX2xhdGxuZy5sbmddLCB7ZHJhZ2dhYmxlOiB0cnVlfSk7XG5cdFx0ICBxdWVzdE1hcC5hZGRMYXllcihtYXJrZXIpO1xuXHRcdH0pO1xuXG5cdFx0bWFya2VyLm9uKCdkcmFnZW5kJywgZnVuY3Rpb24gKGUpIHtcblx0XHRcdCRzY29wZS5xdWVzdC5zdGFydCA9IFtlLnRhcmdldC5fbGF0bG5nLmxhdCxlLnRhcmdldC5fbGF0bG5nLmxuZ107XG5cdFx0fSlcblxuXHRcdGlmICgkc2NvcGUubmV3UXVlc3QpIHtcblx0XHRcdHF1ZXN0TWFwLmxvY2F0ZSgpLm9uKCdsb2NhdGlvbmZvdW5kJywgZnVuY3Rpb24gKGUpIHtcblx0XHRcdFx0cXVlc3RNYXAuc2V0VmlldyhbZS5sYXRpdHVkZSxlLmxvbmdpdHVkZV0sIDE0KTtcblx0XHRcdFx0bWFya2VyLnNldExhdExuZyhbZS5sYXRpdHVkZSxlLmxvbmdpdHVkZV0pO1xuXHRcdFx0XHQkc2NvcGUucXVlc3Quc3RhcnQgPSBbZS5sYXRpdHVkZSxlLmxvbmdpdHVkZV07XG5cdFx0XHR9KTtcblx0XHR9XG5cbn0pIiwiYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHN0YXRlUHJvdmlkZXIpIHtcbiRzdGF0ZVByb3ZpZGVyLnN0YXRlKCdlZGl0b3IucXVlc3RTdGVwJywge1xuXHRcdHVybDogJy9xdWVzdHN0ZXAvOnF1ZXN0U3RlcElkJywgXG5cdFx0dGVtcGxhdGVVcmw6ICdqcy9xdWVzdC1zdGVwLWVkaXRvci9xdWVzdC1zdGVwLWVkaXRvci5odG1sJyxcblx0XHRjb250cm9sbGVyOiAnUXVlc3RTdGVwRWRpdEN0cmwnLFxuXHRcdHJlc29sdmU6IHtcblx0XHRcdHF1ZXN0OiBmdW5jdGlvbihRdWVzdEZhY3RvcnksICRzdGF0ZVBhcmFtcyl7XG4gICAgXHRcdHJldHVybiAkc3RhdGVQYXJhbXMuaWQgIT09IFwiXCIgP1xuXHRcdFx0XHRcdFF1ZXN0RmFjdG9yeS5nZXRPbmVRdWVzdCgkc3RhdGVQYXJhbXMuaWQpIDogXG5cdFx0XHRcdFx0dW5kZWZpbmVkO1xuICAgIFx0XHR9XG5cdFx0fSxcblx0XHRkYXRhOiB7XG4gICAgICBcdFx0YXV0aGVudGljYXRlOiB0cnVlXG4gICAgXHR9XG5cdH0pO1xufSk7XG5cblxuYXBwLmNvbnRyb2xsZXIoJ1F1ZXN0U3RlcEVkaXRDdHJsJywgZnVuY3Rpb24gKCRzdGF0ZVBhcmFtcywgJHNjb3BlLCAkc3RhdGUsICRyb290U2NvcGUsIHF1ZXN0LCBRdWVzdEZhY3Rvcnkpe1xuXHQkc2NvcGUucXVlc3QgPSBxdWVzdDtcblx0JHJvb3RTY29wZS5lZGl0b3JWaXNpYmxlID0gZmFsc2U7XG5cdCRzY29wZS52aWV3TWFwID0gdHJ1ZTtcblxuXHQvL2RlZmluZCBuZXcgU3RlcCBmb3IgYWRkaW5nIHRvIHN0ZXBzIGFycmF5XG5cdCRzY29wZS5uZXdTdGVwID0ge1xuXHRcdG5hbWU6ICdOZXcgU3RlcCcsXG5cdFx0dGFyZ2V0Q2lyY2xlOiB7XG5cdFx0XHRcdGNlbnRlcjogW10sXG5cdFx0XHRcdHJhZGl1czogbnVsbFxuXHRcdFx0fVxuXHRcdH1cdFxuXHQvL2lmIHdlIGhhdmUgc3RlcHMsIGZpbmQgdGhlIGluZGV4IG9mIHRoZSBzdGVwIHRoYXQgbWF0Y2hlcyB0aGUgcGFyYW1zXG5cdGlmKCRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzLmxlbmd0aCA+IDApIHtcblx0XHQkc2NvcGUucXVlc3QucXVlc3RTdGVwcy5mb3JFYWNoKCBmdW5jdGlvbiAoc3RlcCwgaW5kZXgpIHtcblx0XHRcdGlmIChzdGVwLl9pZCA9PT0gJHN0YXRlUGFyYW1zLnF1ZXN0U3RlcElkKSB7XG5cdFx0XHRcdCRzY29wZS5xdWVzdC5pZHggPSBpbmRleDtcblx0XHRcdH1cblx0XHR9KVxuXHRcdC8vc2V0cyBjdXJyZW50U3RlcCB0byB0aGF0IG1hdGNoaW5nIHRoZSBwYXJhbWV0ZXJzXG5cdFx0JHNjb3BlLmN1cnJlbnRTdGVwID0gJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHNbJHNjb3BlLnF1ZXN0LmlkeF07XG5cdH0gZWxzZSB7XG5cdFx0JHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMucHVzaCgkc2NvcGUubmV3U3RlcCk7XG5cdFx0JHNjb3BlLmN1cnJlbnRTdGVwID0gJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHNbMF1cblx0fVxuXHQvL2Z1bmN0aW9uIHRvIHN3aXRjaCBzdGF0ZXMgd2l0aGluIG1hcFN0YXRlIGVkaXRvclxuXHQkc2NvcGUuc3dpdGNoU3RlcCA9IGZ1bmN0aW9uIChjbGlja2VkU3RlcCkge1xuXHRcdFF1ZXN0RmFjdG9yeS5zYXZlKCRzY29wZS5xdWVzdClcblx0XHQudGhlbihmdW5jdGlvbiAoKSB7XG5cdFx0Ly8gcmVkaXJlY3QgdG8gdGhlIGNsaWNrZWQgbWFwc3RhdGVcblx0XHRcdCRzdGF0ZS5nbygnZWRpdG9yLnF1ZXN0U3RlcCcsIHtxdWVzdFN0ZXBJZDogY2xpY2tlZFN0ZXAuX2lkfSk7XHRcblx0XHR9KVxuXHR9O1xuXHQkc2NvcGUuc2F2ZVF1ZXN0U3RlcHMgPSBmdW5jdGlvbiAoKSB7XG5cdC8vdXBkYXRlcyBjdXJyZW50IG1hcFN0YXRlXG5cdFx0UXVlc3RGYWN0b3J5LnNhdmUoJHNjb3BlLnF1ZXN0KVxuXHRcdC50aGVuKGZ1bmN0aW9uICh1cGRhdGVkUXVlc3QpIHtcblx0XHRcdCRzY29wZS5xdWVzdCA9IHVwZGF0ZWRRdWVzdDtcblx0XHRcdCRzdGF0ZS5nbygnZWRpdG9yJywge2lkOiAkc2NvcGUucXVlc3QuX2lkfSwge3JlbG9hZDogdHJ1ZX0pO1x0XG5cdFx0fSlcblx0fTtcblx0JHNjb3BlLnJldHVybldpdGhvdXRTYXZpbmcgPSBmdW5jdGlvbiAoKSB7XG5cdFx0XHQkc3RhdGUuZ28oJ2VkaXRvcicsIHtpZDogJHNjb3BlLnF1ZXN0Ll9pZH0sIHtyZWxvYWQ6IHRydWV9KTtcdFxuXHR9O1xuXHQkc2NvcGUuYWRkUXVlc3RTdGVwID0gZnVuY3Rpb24gKCkge1xuXHRcdCRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzLnB1c2goJHNjb3BlLm5ld1N0ZXApO1xuXHRcdHJldHVybiBRdWVzdEZhY3Rvcnkuc2F2ZSgkc2NvcGUucXVlc3QpXG5cdFx0LnRoZW4oIGZ1bmN0aW9uICh1cGRhdGVkUXVlc3QpIHtcblx0XHRcdCRzY29wZS5xdWVzdCA9IHVwZGF0ZWRRdWVzdDtcblx0XHRcdCRzdGF0ZS5nbygnZWRpdG9yLnF1ZXN0U3RlcCcsIHtxdWVzdFN0ZXBJZDogJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHNbJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMubGVuZ3RoLTFdLl9pZH0pO1xuXHRcdH0pXG5cblx0fTtcblx0JHNjb3BlLnJlbW92ZVF1ZXN0U3RlcCA9IGZ1bmN0aW9uICgpIHtcblx0XHR2YXIgaW5kZXggPSAkc2NvcGUucXVlc3QucXVlc3RTdGVwcy5pbmRleE9mKCRzY29wZS5jdXJyZW50U3RlcCk7XG5cdFx0JHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHRpZiAoaW5kZXggPT09ICRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzLmxlbmd0aCkgaW5kZXgtLTtcblx0XHRyZXR1cm4gUXVlc3RGYWN0b3J5LnNhdmUoJHNjb3BlLnF1ZXN0KVxuXHRcdC50aGVuKCBmdW5jdGlvbiAodXBkYXRlZFF1ZXN0KSB7XG5cdFx0XHQkc2NvcGUucXVlc3QgPSB1cGRhdGVkUXVlc3Q7XG5cdFx0XHR2YXIgc3RlcERlc3RpbmF0aW9uID0gJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMubGVuZ3RoPT09MCA/IG51bGwgOiAkc2NvcGUucXVlc3QucXVlc3RTdGVwc1tpbmRleF0uX2lkO1xuXHRcdFx0JHN0YXRlLmdvKCdlZGl0b3IucXVlc3RTdGVwJywge3F1ZXN0U3RlcElkOiBzdGVwRGVzdGluYXRpb259LCB7cmVsb2FkOiB0cnVlfSk7XG5cdFx0fSlcblx0fTtcblxuXHQvLyAvL2Z1bmN0aW9uIHRvIHNldCBtYXAgdG8gZWl0aGVyIHRhcmdldCByZWdpb24gb3IgbWFwIHN0YXJ0aW5nIHBvaW50IGlmIG5vIHRhcmdldCByZWdpb25cblx0dmFyIG1hcFZpZXcgPSBmdW5jdGlvbiAoKSB7XG5cblx0XHRpZiAoJHNjb3BlLmN1cnJlbnRTdGVwLnRhcmdldENpcmNsZS5jZW50ZXIubGVuZ3RoID09PSAyKSB7XG5cdFx0XHRyZXR1cm4oJHNjb3BlLmN1cnJlbnRTdGVwLnRhcmdldENpcmNsZS5jZW50ZXIpXG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiAkc2NvcGUucXVlc3Quc3RhcnRcblx0XHR9XG5cdH07XG5cdC8vIC8vaW5pdGlhbGl6ZSBtYXAgYW5kIHNldCB2aWV3IHVzaW5nIG1hcFZpZXcgZnVuY3Rpb25cblx0dmFyIHF1ZXN0U3RlcE1hcCA9IEwubWFwKCdxdWVzdC1zdGVwLW1hcCcpLnNldFZpZXcobWFwVmlldygpLCAxNSk7XG5cdC8vYWRkIHBpcmF0ZSBtYXAgdGlsZXNcblx0TC50aWxlTGF5ZXIoJ2h0dHBzOi8vYXBpLnRpbGVzLm1hcGJveC5jb20vdjQve2lkfS97en0ve3h9L3t5fS5wbmc/YWNjZXNzX3Rva2VuPXthY2Nlc3NUb2tlbn0nLCB7XG4gICAgbWF4Wm9vbTogMTgsXG4gICAgaWQ6ICdzY290dGVnZ3Mubzc2MTRqbDInLFxuICAgIGFjY2Vzc1Rva2VuOiAncGsuZXlKMUlqb2ljMk52ZEhSbFoyZHpJaXdpWVNJNkltTnBhRFpvWnpobWRqQmpNRFoxY1dvNWFHY3lhWGx0ZVRraWZRLkxaZTAtSUJSUW1aMFBrUUJzWUlsaXcnXG5cdH0pLmFkZFRvKHF1ZXN0U3RlcE1hcCk7XG5cblx0Ly8gSW5pdGlhbGl6ZSB0aGUgRmVhdHVyZUdyb3VwIHRvIHN0b3JlIGVkaXRhYmxlIGxheWVyc1xuXHR2YXIgZHJhd25JdGVtcyA9IG5ldyBMLkZlYXR1cmVHcm91cCgpO1xuXHRxdWVzdFN0ZXBNYXAuYWRkTGF5ZXIoZHJhd25JdGVtcyk7XG5cblx0Ly8gSW5pdGlhbGl6ZSB0aGUgZHJhdyBjb250cm9sIGFuZCBwYXNzIGl0IHRoZSBGZWF0dXJlR3JvdXAgb2YgZWRpdGFibGUgbGF5ZXJzXG5cdHZhciBkcmF3Q29udHJvbCA9IG5ldyBMLkNvbnRyb2wuRHJhdyh7XG5cdCAgICBkcmF3OiB7XG5cdCAgICBcdHBvbHlsaW5lOiBmYWxzZSxcblx0ICAgIFx0cG9seWdvbjogZmFsc2UsXG5cdCAgICBcdHJlY3RhbmdsZTogZmFsc2UsXG5cdCAgICBcdG1hcmtlcjogZmFsc2Vcblx0ICAgIH0sXG5cdCAgICBlZGl0OiB7XG5cdCAgICAgICAgZmVhdHVyZUdyb3VwOiBkcmF3bkl0ZW1zXG5cdCAgICB9XG5cdH0pO1xuXHRxdWVzdFN0ZXBNYXAuYWRkQ29udHJvbChkcmF3Q29udHJvbCk7XG5cdC8vaWYgdGhlcmUgaXMgYSB0YXJnZXQgcmVnaW9uLCBkcmF3IGl0IG9uIHRoZSBtYXBcblx0aWYgKCRzY29wZS5jdXJyZW50U3RlcC50YXJnZXRDaXJjbGUuY2VudGVyLmxlbmd0aCA9PT0gMikge1xuXHRcdHZhciBjdXJyZW50UmVnaW9uID0gTC5jaXJjbGUoJHNjb3BlLmN1cnJlbnRTdGVwLnRhcmdldENpcmNsZS5jZW50ZXIsJHNjb3BlLmN1cnJlbnRTdGVwLnRhcmdldENpcmNsZS5yYWRpdXMpO1xuXHRcdHF1ZXN0U3RlcE1hcC5hZGRMYXllcihjdXJyZW50UmVnaW9uKTtcblx0fVxuXHR2YXIgY2lyY2xlO1xuXHRxdWVzdFN0ZXBNYXAub24oJ2RyYXc6Y3JlYXRlZCcsIGZ1bmN0aW9uIChlKSB7XG5cdC8vcmVtb3ZlIHRoZSBsb2FkZWQgcmVnaW9uIHRoZW4gcmVtb3ZlIGFueSBuZXdseSBkcmF3biBjaXJjbGVzXG4gIFx0aWYoY3VycmVudFJlZ2lvbikgcXVlc3RTdGVwTWFwLnJlbW92ZUxheWVyKGN1cnJlbnRSZWdpb24pO1xuICBcdGlmKGNpcmNsZSkgcXVlc3RTdGVwTWFwLnJlbW92ZUxheWVyKGNpcmNsZSk7XG4gIFx0dmFyIHR5cGUgPSBlLmxheWVyVHlwZTtcbiAgXHR2YXIgbGF5ZXIgPSBlLmxheWVyO1xuICBcdC8vYXNzaWduIHRhcmdldCByZWdpb24gdG8gcHJvcGVydGllcyBvZiBkcmF3biBvYmplY3RcbiAgICAkc2NvcGUuY3VycmVudFN0ZXAudGFyZ2V0Q2lyY2xlLmNlbnRlciA9IFtsYXllci5fbGF0bG5nLmxhdCxsYXllci5fbGF0bG5nLmxuZ107XG4gICAgJHNjb3BlLmN1cnJlbnRTdGVwLnRhcmdldENpcmNsZS5yYWRpdXMgPSBsYXllci5fbVJhZGl1cztcbiAgICAvL2RlY2xhcmUgbmV3IG9iamVjdCBiYXNlZCBvbiBwcm9wZXJ0aWVkIGRyYXduIGFuZCBhZGQgdG8gbWFwXG4gICAgY2lyY2xlID0gTC5jaXJjbGUoW2xheWVyLl9sYXRsbmcubGF0LGxheWVyLl9sYXRsbmcubG5nXSwgbGF5ZXIuX21SYWRpdXMpO1xuICAgIHF1ZXN0U3RlcE1hcC5hZGRMYXllcihjaXJjbGUpO1xuXHR9KTtcblxuXHQkc2NvcGUuZ2V0TW9kYWxCdXR0b25UZXh0ID0gZnVuY3Rpb24oKSB7XG5cdFx0aWYgKCRzY29wZS5jdXJyZW50U3RlcC50cmFuc2l0aW9uSW5mby5xdWVzdGlvbi5sZW5ndGgpIHJldHVybiBcIlN1Ym1pdCFcIjtcblx0XHRyZXR1cm4gXCJHb3QgaXQhXCI7XG5cdH07XG59KTtcblxuXG5cbiIsImFwcC5jb25maWcoZnVuY3Rpb24gKCRzdGF0ZVByb3ZpZGVyKXtcblx0JHN0YXRlUHJvdmlkZXIuc3RhdGUoJ2Rhc2hib2FyZCcse1xuXHRcdHVybDogJy9kYXNoYm9hcmQvOnVzZXJJZCcsXG5cdFx0dGVtcGxhdGVVcmw6ICdqcy91c2VyLWRhc2hib2FyZC9kYXNoYm9hcmQuaHRtbCcsXG5cdFx0Y29udHJvbGxlcjogJ0Rhc2hDdHJsJyxcblx0XHRyZXNvbHZlOiB7XG5cdFx0XHR1c2VyUXVlc3RzOiBmdW5jdGlvbihRdWVzdEZhY3RvcnksICRzdGF0ZVBhcmFtcyl7XG5cdFx0XHRcdHJldHVybiBRdWVzdEZhY3RvcnkuZ2V0VXNlclF1ZXN0cygkc3RhdGVQYXJhbXMudXNlcklkKTtcblx0XHRcdH1cblx0XHR9LFxuXHRcdGRhdGE6IHtcbiAgICAgICAgICAgIGF1dGhlbnRpY2F0ZTogdHJ1ZVxuICAgICAgICB9XG5cdH0pO1xufSk7XG5cbmFwcC5jb250cm9sbGVyKCdEYXNoQ3RybCcsIGZ1bmN0aW9uICgkc3RhdGUsICRzY29wZSwgdXNlclF1ZXN0cywgU2Vzc2lvbiwgUXVlc3RGYWN0b3J5KXtcblx0JHNjb3BlLmRhc2hib2FyZCA9IHRydWU7XG5cdCRzY29wZS5xdWVzdHMgPSBbXTtcblx0JHNjb3BlLnF1ZXN0cyA9IHVzZXJRdWVzdHMubWFwKGZ1bmN0aW9uKGcpIHsgXG5cdFx0Zy5zaG93RGV0YWlsID0gZmFsc2U7XG5cdFx0cmV0dXJuIGc7XG5cdH0pO1xuXG5cdCRzY29wZS5nb1RvRWRpdG9yID0gZnVuY3Rpb24gKHF1ZXN0Q2xpY2tlZCkge1xuXHRcdCRzdGF0ZS5nbygnZWRpdG9yJywge2lkOiBxdWVzdENsaWNrZWQuX2lkfSwge3JlbG9hZDogdHJ1ZX0pO1xuXHR9O1xuXHQkc2NvcGUuZGVsZXRlUXVlc3QgPSBmdW5jdGlvbiAocXVlc3RDbGlja2VkKSB7XG5cdFx0cmV0dXJuIFF1ZXN0RmFjdG9yeS5kZWxldGUocXVlc3RDbGlja2VkKVxuXHRcdC50aGVuKCBmdW5jdGlvbiAoZGVsZXRlZFF1ZXN0KSB7XG5cdFx0XHQkc3RhdGUuZ28oJ2Rhc2hib2FyZCcsIHt1c2VySWQ6IFNlc3Npb24udXNlci5faWR9LCB7cmVsb2FkOiB0cnVlfSk7XG5cdFx0fSk7XG5cdH07XG5cdCRzY29wZS5wYXJlbnRDbGljayA9IGZ1bmN0aW9uKGluZGV4KSB7XG5cdFx0dmFyIHF1ZXN0ID0gJHNjb3BlLnF1ZXN0c1tpbmRleF07XG5cdFx0cXVlc3Quc2hvd0RldGFpbCA9ICFxdWVzdC5zaG93RGV0YWlsO1xuXHR9O1xuXHQkc2NvcGUuc3dpdGNoQWN0aXZlID0gZnVuY3Rpb24gKHF1ZXN0Q2xpY2tlZCkge1xuXHRcdFF1ZXN0RmFjdG9yeS5zYXZlKHF1ZXN0Q2xpY2tlZCk7XG5cdH07XG59KTtcblxuIiwiYXBwLmZhY3RvcnkoJ1F1ZXN0RmFjdG9yeScsIGZ1bmN0aW9uICgkaHR0cCwgU2Vzc2lvbikge1xuXG5cdHJldHVybiB7XG5cblx0XHRnZXRBbGxRdWVzdHM6IGZ1bmN0aW9uKCkge1xuXHRcdFx0cmV0dXJuICRodHRwLmdldCgnL2FwaS9xdWVzdHMnKVxuXHRcdFx0LnRoZW4oZnVuY3Rpb24ocmVzKSB7XG5cdFx0XHRcdHJldHVybiByZXMuZGF0YTtcblx0XHRcdH0pO1xuXHRcdH0sXG5cdFx0Z2V0T25lUXVlc3Q6IGZ1bmN0aW9uKHF1ZXN0SWQpe1xuXHRcdFx0cmV0dXJuICRodHRwLmdldCgnL2FwaS9xdWVzdHMvJyArIHF1ZXN0SWQpXG5cdFx0XHRcdC50aGVuKGZ1bmN0aW9uKHJlcyl7XG5cdFx0XHRcdFx0cmV0dXJuIHJlcy5kYXRhO1xuXHRcdFx0XHR9KTtcblx0XHR9LFxuXHRcdGdldFVzZXJRdWVzdHM6IGZ1bmN0aW9uKHVzZXJJZCkge1xuXHRcdFx0cmV0dXJuICRodHRwLmdldCgnL2FwaS9xdWVzdHMvdXNlcnF1ZXN0cy8nICsgdXNlcklkKVxuXHRcdFx0LnRoZW4oZnVuY3Rpb24ocmVzKXtcblx0XHRcdFx0cmV0dXJuIHJlcy5kYXRhO1xuXHRcdFx0fSk7XG5cdFx0fSxcblx0XHRzYXZlOiBmdW5jdGlvbiAocXVlc3QpIHtcblx0XHRcdHJldHVybiAkaHR0cC5wdXQoJy9hcGkvcXVlc3RzLycgKyBxdWVzdC5faWQsIHF1ZXN0KVxuXHRcdFx0LnRoZW4oZnVuY3Rpb24gKHJlcyl7XG5cdFx0XHRcdHJldHVybiByZXMuZGF0YTtcblx0XHRcdH0pO1xuXHRcdH0sXG5cdFx0c2F2ZU5ldzogZnVuY3Rpb24gKHF1ZXN0KSB7XG5cdFx0XHRxdWVzdC5hdXRob3IgPSBTZXNzaW9uLnVzZXIuX2lkO1xuXHRcdFx0cmV0dXJuICRodHRwLnBvc3QoJy9hcGkvcXVlc3RzLycsIHF1ZXN0KVxuXHRcdFx0LnRoZW4oZnVuY3Rpb24gKHJlcykge1xuXHRcdFx0XHRyZXR1cm4gcmVzLmRhdGE7XG5cdFx0XHR9KTtcblx0XHR9LFxuXHRcdGRlbGV0ZTogZnVuY3Rpb24gKHF1ZXN0KSB7XG5cdFx0XHRyZXR1cm4gJGh0dHAuZGVsZXRlKCcvYXBpL3F1ZXN0cy8nICsgcXVlc3QuX2lkKTtcblx0XHR9XG5cdH07XG59KTtcbiIsImFwcC5kaXJlY3RpdmUoJ25hdmJhcicsIGZ1bmN0aW9uICgkcm9vdFNjb3BlLCBBdXRoU2VydmljZSwgQVVUSF9FVkVOVFMsICRzdGF0ZSkge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgcmVzdHJpY3Q6ICdFJyxcbiAgICAgICAgc2NvcGU6IHtcbiAgICAgICAgICAgIGhvbWU6ICc9JyxcbiAgICAgICAgICAgIGRhc2hib2FyZDogJz0nXG4gICAgICAgIH0sXG4gICAgICAgIHRlbXBsYXRlVXJsOiAnanMvY29tbW9uL2RpcmVjdGl2ZXMvbmF2YmFyL25hdmJhci5odG1sJyxcbiAgICAgICAgbGluazogZnVuY3Rpb24gKHNjb3BlKSB7XG5cbiAgICAgICAgICAgIHNjb3BlLml0ZW1zID0gW1xuICAgICAgICAgICAgICAgIHsgbGFiZWw6ICdEYXNoYm9hcmQnLCBzdGF0ZTogJ2hvbWUnICwgYXV0aDogdHJ1ZX0sXG4gICAgICAgICAgICAgICAgeyBsYWJlbDogJ05ldyBRdWVzdCcsIHN0YXRlOiAnZWRpdG9yJywgYXV0aDogdHJ1ZSB9XG4gICAgICAgICAgICBdO1xuXG4gICAgICAgICAgICBzY29wZS51c2VyID0gbnVsbDtcblxuICAgICAgICAgICAgc2NvcGUuaXNMb2dnZWRJbiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gQXV0aFNlcnZpY2UuaXNBdXRoZW50aWNhdGVkKCk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBzY29wZS5sb2dvdXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgQXV0aFNlcnZpY2UubG9nb3V0KCkudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgJHN0YXRlLmdvKCdob21lJyk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICB2YXIgc2V0VXNlciA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBBdXRoU2VydmljZS5nZXRMb2dnZWRJblVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgICAgICAgICAgICAgIHNjb3BlLnVzZXIgPSB1c2VyO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgdmFyIHJlbW92ZVVzZXIgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgc2NvcGUudXNlciA9IG51bGw7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBzZXRVc2VyKCk7XG5cbiAgICAgICAgICAgICRyb290U2NvcGUuJG9uKEFVVEhfRVZFTlRTLmxvZ2luU3VjY2Vzcywgc2V0VXNlcik7XG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRvbihBVVRIX0VWRU5UUy5sb2dvdXRTdWNjZXNzLCByZW1vdmVVc2VyKTtcbiAgICAgICAgICAgICRyb290U2NvcGUuJG9uKEFVVEhfRVZFTlRTLnNlc3Npb25UaW1lb3V0LCByZW1vdmVVc2VyKTtcblxuICAgICAgICAgICAgLy8gSWYgbm90ICdIb21lJywgcmVtb3ZlIHNjcm9sbCBhbmltYXRpb25cbiAgICAgICAgICAgICRyb290U2NvcGUuJG9uKCckc3RhdGVDaGFuZ2VTdWNjZXNzJywgZnVuY3Rpb24gKGV2ZW50LCB0b1N0YXRlKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRvU3RhdGUubmFtZSAhPT0gJ2hvbWUnKSB7XG4gICAgICAgICAgICAgICAgICAgICQoJy5uYXZiYXItZml4ZWQtdG9wJykuYWRkQ2xhc3MoJ3RvcC1uYXYtY29sbGFwc2UnKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ2dvaW5nIG5vdCBob21lJyk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgJCgnLm5hdmJhci1maXhlZC10b3AnKS5yZW1vdmVDbGFzcygndG9wLW5hdi1jb2xsYXBzZScpO1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnZ29pbmcgaG9tZScpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIFByZXR0eSBTY3JvbGxpbmcgTmF2YmFyIEVmZmVjdFxuICAgICAgICAgICAgJCh3aW5kb3cpLnNjcm9sbChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICBpZiAoJCgnLm5hdmJhcicpLm9mZnNldCgpLnRvcCA+IDUwICYmIHNjb3BlLmhvbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgJCgnLm5hdmJhci1maXhlZC10b3AnKS5hZGRDbGFzcygndG9wLW5hdi1jb2xsYXBzZScpO1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnZG9vb293d3d3d24nKVxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoc2NvcGUuaG9tZSkge1xuICAgICAgICAgICAgICAgICAgICAkKCcubmF2YmFyLWZpeGVkLXRvcCcpLnJlbW92ZUNsYXNzKCd0b3AtbmF2LWNvbGxhcHNlJyk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCd1dXV1dXV1cCcpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIEFuaW1hdGVkIFNjcm9sbCBUbyBTZWN0aW9uXG4gICAgICAgICAgICAkKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICQoJy5wYWdlLXNjcm9sbCBhJykuYmluZCgnY2xpY2snLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyICRhbmNob3IgPSAkKHRoaXMpO1xuICAgICAgICAgICAgICAgICAgICAkKCdodG1sLCBib2R5Jykuc3RvcCgpLmFuaW1hdGUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgc2Nyb2xsVG9wOiAkKCRhbmNob3IuYXR0cignaHJlZicpKS5vZmZzZXQoKS50b3BcbiAgICAgICAgICAgICAgICAgICAgfSwgMTUwMCwgJ2Vhc2VJbk91dEV4cG8nKTtcbiAgICAgICAgICAgICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgIH1cblxuICAgIH07XG5cbn0pO1xuIiwiYXBwLmRpcmVjdGl2ZSgnZnVsbHN0YWNrTG9nbycsIGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4ge1xuICAgICAgICByZXN0cmljdDogJ0UnLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2NvbW1vbi9kaXJlY3RpdmVzL2Z1bGxzdGFjay1sb2dvL2Z1bGxzdGFjay1sb2dvLmh0bWwnXG4gICAgfTtcbn0pOyJdLCJzb3VyY2VSb290IjoiL3NvdXJjZS8ifQ==
