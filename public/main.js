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
			$scope.loginError = "I think you\'ve entered the wrong info, friend";
		});
	};

	$scope.sendSignup = function (signupInfo) {
		$scope.error = null;
		AuthService.signup(signupInfo).then(function (user) {
			$state.go('dashboard', { userId: user._id }, { reload: true });
		})['catch'](function () {
			$scope.signupError = "I'm afraid we already have someone by that name";
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

app.controller('EditorCtrl', function ($scope, $stateParams, $uibModal, $state, $rootScope, quest, Session, QuestFactory, AuthService) {
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
		// filter out all questSteps without targetCirlcles or transitionInfo.title
		quest.questSteps = quest.questSteps.filter(function (step) {
			return step.targetCircle.center.length && step.transitionInfo.title;
		});

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

	$scope.logout = function () {
		AuthService.logout().then(function () {
			$state.go('home');
		});
	};

	//***********  MAP FUNCTIONS BELOW  ***********************
	var userLocation;
	var targetCircles = [];
	var circleCenters = [];
	var questMap = L.map('quest-map').setView([40.723008, -74.0006327], 13);
	questMap.scrollWheelZoom.disable(); // Really annoying when it happens accidently
	L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
		maxZoom: 18,
		id: 'scotteggs.o7614jl2',
		accessToken: 'pk.eyJ1Ijoic2NvdHRlZ2dzIiwiYSI6ImNpaDZoZzhmdjBjMDZ1cWo5aGcyaXlteTkifQ.LZe0-IBRQmZ0PkQBsYIliw'
	}).addTo(questMap);

	// If there are no targetCircles yet created, set map view to user's location
	if (!$scope.quest.questSteps[0] || !$scope.quest.questSteps[0].targetCircle) {

		questMap.locate().on('locationfound', function (e) {
			userLocation = [e.latitude, e.longitude];
			questMap.setView(userLocation, 14);
		});
	}

	// Redraw all targetCircles for the quest on the map and reset the bounds
	function drawCircles() {
		// Remove all circles
		targetCircles.forEach(function (circle) {
			questMap.removeLayer(circle);
		});
		// Draw a circle for every targetCircle in the quest
		if ($scope.quest.questSteps.length) {
			$scope.quest.questSteps.forEach(function (step, index) {
				if (step.targetCircle && step.targetCircle.center.length) {
					var center = step.targetCircle.center;
					var radius = step.targetCircle.radius;
					var circle = L.circle(center, radius);
					circle.bindLabel((index + 1).toString(), { noHide: true }).addTo(questMap);
					targetCircles.push(circle);
					circleCenters.push(step.targetCircle.center);
				}
			});
			questMap.fitBounds(circleCenters);
		}
	}
	drawCircles();
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
	var userLocation;
	$scope.targetError = false;
	$scope.titleError = false;

	//defind new Step for adding to steps array
	$scope.newStep = {
		name: 'New Step',
		targetCircle: {
			center: [],
			radius: null
		}
	};
	// if we have steps, find the index of the step that matches the params
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
		if ($scope.currentStep.targetCircle.center.length && $scope.currentStep.transitionInfo && $scope.currentStep.transitionInfo.title) {
			QuestFactory.save($scope.quest).then(function () {
				// redirect to the clicked mapstate
				$state.go('editor.questStep', { questStepId: clickedStep._id });
			});
		} else {
			if (!$scope.currentStep.targetCircle.center.length) flashError('targetError');
			if (!$scope.currentStep.transitionInfo || !$scope.currentStep.transitionInfo.title) flashError('titleError');
		}
	};
	$scope.saveQuestSteps = function () {
		if ($scope.currentStep.targetCircle.center.length) {
			//update quest
			QuestFactory.save($scope.quest).then(function (updatedQuest) {
				$scope.quest = updatedQuest;
				$state.go('editor', { id: $scope.quest._id }, { reload: true });
			});
		} else flashError('targetError');
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

	function flashError(errorType) {
		$scope[errorType] = true;
		setTimeout(function () {
			$scope[errorType] = false;
			$scope.$digest();
		}, 3000);
	}

	// MAP BELOW ===================================>>

	// initialize map
	var questStepMap = L.map('quest-step-map');
	questStepMap.scrollWheelZoom.disable(); // Really annoying when it happens accidently
	//add pirate map tiles
	L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
		maxZoom: 18,
		id: 'scotteggs.o7614jl2',
		accessToken: 'pk.eyJ1Ijoic2NvdHRlZ2dzIiwiYSI6ImNpaDZoZzhmdjBjMDZ1cWo5aGcyaXlteTkifQ.LZe0-IBRQmZ0PkQBsYIliw'
	}).addTo(questStepMap);

	// Set view using targetCircle for this step if defined
	// Then try first targetCircle for quest if defined
	// Otherwise get user's location and set map view with that
	if ($scope.currentStep.targetCircle.center.length === 2) {
		questStepMap.setView($scope.currentStep.targetCircle.center, 15);
	} else if ($scope.quest.questSteps[0].targetCircle.center.length === 2) {
		questStepMap.setView($scope.quest.questSteps[0].targetCircle.center, 15);
	} else {
		questStepMap.locate().on('locationfound', function (e) {
			userLocation = [e.latitude, e.longitude];
			questStepMap.setView(userLocation, 15);
		});
	}

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
		if ($scope.currentStep && $scope.currentStep.transitionInfo && $scope.currentStep.transitionInfo.question) return "Submit!";
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

app.directive('blueHeader', function (AuthService, $state) {

	return {
		restrict: 'E',
		scope: {
			head: '@',
			small: '@'
		},
		templateUrl: 'js/common/directives/blue-header/blue-header.html',
		link: function link(scope) {

			scope.user = null;

			var setUser = function setUser() {
				AuthService.getLoggedInUser().then(function (user) {
					scope.user = user;
				});
			};

			setUser();

			scope.logout = function () {
				AuthService.logout().then(function () {
					$state.go('home');
				});
			};
		}
	};
});
app.directive('fullstackLogo', function () {
	return {
		restrict: 'E',
		templateUrl: 'js/common/directives/fullstack-logo/fullstack-logo.html'
	};
});
app.directive('resolveLoader', function ($rootScope, $timeout) {

	return {
		restrict: 'E',
		replace: true,
		template: '<div class="alert alert-success ng-hide"><strong>Welcome!</strong> Loading up! </div>',
		link: function link(scope, element) {

			$rootScope.$on('$routeChangeStart', function (event, currentRoute, previousRoute) {
				if (previousRoute) return;

				$timeout(function () {
					element.removeClass('ng-hide');
				});
			});

			$rootScope.$on('$routeChangeSuccess', function () {
				element.addClass('ng-hide');
			});
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImFwcC5qcyIsImZzYS9mc2EtcHJlLWJ1aWx0LmpzIiwiaG9tZS9ob21lLmpzIiwicXVlc3QtZWRpdG9yL2VkaXRvci5qcyIsInF1ZXN0LXN0ZXAtZWRpdG9yL3F1ZXN0LXN0ZXAtZWRpdG9yLmpzIiwidXNlci1kYXNoYm9hcmQvZGFzaGJvYXJkLmpzIiwiY29tbW9uL2ZhY3Rvcmllcy9xdWVzdEZhY3RvcnkuanMiLCJjb21tb24vZGlyZWN0aXZlcy9ibHVlLWhlYWRlci9ibHVlLWhlYWRlci5qcyIsImNvbW1vbi9kaXJlY3RpdmVzL2Z1bGxzdGFjay1sb2dvL2Z1bGxzdGFjay1sb2dvLmpzIiwiY29tbW9uL2RpcmVjdGl2ZXMvbG9hZGluZy9sb2FkaW5nLmpzIiwiY29tbW9uL2RpcmVjdGl2ZXMvbmF2YmFyL25hdmJhci5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFBLENBQUE7QUFDQSxNQUFBLENBQUEsR0FBQSxHQUFBLE9BQUEsQ0FBQSxNQUFBLENBQUEsVUFBQSxFQUFBLENBQUEsYUFBQSxFQUFBLFdBQUEsRUFBQSxhQUFBLEVBQUEsY0FBQSxFQUFBLFdBQUEsRUFBQSxtQkFBQSxDQUFBLENBQUEsQ0FBQTs7QUFFQSxHQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsa0JBQUEsRUFBQSxpQkFBQSxFQUFBOztBQUVBLGtCQUFBLENBQUEsU0FBQSxDQUFBLElBQUEsQ0FBQSxDQUFBOztBQUVBLG1CQUFBLENBQUEsU0FBQSxDQUFBLFlBQUEsQ0FBQSxDQUFBO0NBQ0EsQ0FBQSxDQUFBOzs7QUFHQSxHQUFBLENBQUEsR0FBQSxDQUFBLFVBQUEsVUFBQSxFQUFBLFdBQUEsRUFBQSxNQUFBLEVBQUE7OztBQUdBLEtBQUEsNEJBQUEsR0FBQSxTQUFBLDRCQUFBLENBQUEsS0FBQSxFQUFBO0FBQ0EsU0FBQSxLQUFBLENBQUEsSUFBQSxJQUFBLEtBQUEsQ0FBQSxJQUFBLENBQUEsWUFBQSxDQUFBO0VBQ0EsQ0FBQTs7OztBQUlBLFdBQUEsQ0FBQSxHQUFBLENBQUEsbUJBQUEsRUFBQSxVQUFBLEtBQUEsRUFBQSxPQUFBLEVBQUEsUUFBQSxFQUFBOztBQUVBLE1BQUEsQ0FBQSw0QkFBQSxDQUFBLE9BQUEsQ0FBQSxFQUFBOzs7QUFHQSxVQUFBO0dBQ0E7O0FBRUEsTUFBQSxXQUFBLENBQUEsZUFBQSxFQUFBLEVBQUE7OztBQUdBLFVBQUE7R0FDQTs7O0FBR0EsT0FBQSxDQUFBLGNBQUEsRUFBQSxDQUFBOztBQUVBLGFBQUEsQ0FBQSxlQUFBLEVBQUEsQ0FBQSxJQUFBLENBQUEsVUFBQSxJQUFBLEVBQUE7Ozs7QUFJQSxPQUFBLElBQUEsRUFBQTtBQUNBLFVBQUEsQ0FBQSxFQUFBLENBQUEsT0FBQSxDQUFBLElBQUEsRUFBQSxRQUFBLENBQUEsQ0FBQTtJQUNBLE1BQUE7QUFDQSxVQUFBLENBQUEsRUFBQSxDQUFBLE9BQUEsQ0FBQSxDQUFBO0lBQ0E7R0FDQSxDQUFBLENBQUE7RUFFQSxDQUFBLENBQUE7Q0FFQSxDQUFBLENBQUE7O0FDbERBLENBQUEsWUFBQTs7QUFFQSxhQUFBLENBQUE7OztBQUdBLEtBQUEsQ0FBQSxNQUFBLENBQUEsT0FBQSxFQUFBLE1BQUEsSUFBQSxLQUFBLENBQUEsd0JBQUEsQ0FBQSxDQUFBOztBQUVBLEtBQUEsR0FBQSxHQUFBLE9BQUEsQ0FBQSxNQUFBLENBQUEsYUFBQSxFQUFBLEVBQUEsQ0FBQSxDQUFBOztBQUVBLElBQUEsQ0FBQSxPQUFBLENBQUEsUUFBQSxFQUFBLFlBQUE7QUFDQSxNQUFBLENBQUEsTUFBQSxDQUFBLEVBQUEsRUFBQSxNQUFBLElBQUEsS0FBQSxDQUFBLHNCQUFBLENBQUEsQ0FBQTtBQUNBLFNBQUEsTUFBQSxDQUFBLEVBQUEsQ0FBQSxNQUFBLENBQUEsUUFBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBO0VBQ0EsQ0FBQSxDQUFBOzs7OztBQUtBLElBQUEsQ0FBQSxRQUFBLENBQUEsYUFBQSxFQUFBO0FBQ0EsY0FBQSxFQUFBLG9CQUFBO0FBQ0EsYUFBQSxFQUFBLG1CQUFBO0FBQ0EsZUFBQSxFQUFBLHFCQUFBO0FBQ0EsZ0JBQUEsRUFBQSxzQkFBQTtBQUNBLGtCQUFBLEVBQUEsd0JBQUE7QUFDQSxlQUFBLEVBQUEscUJBQUE7RUFDQSxDQUFBLENBQUE7O0FBRUEsSUFBQSxDQUFBLE9BQUEsQ0FBQSxpQkFBQSxFQUFBLFVBQUEsVUFBQSxFQUFBLEVBQUEsRUFBQSxXQUFBLEVBQUE7QUFDQSxNQUFBLFVBQUEsR0FBQTtBQUNBLE1BQUEsRUFBQSxXQUFBLENBQUEsZ0JBQUE7QUFDQSxNQUFBLEVBQUEsV0FBQSxDQUFBLGFBQUE7QUFDQSxNQUFBLEVBQUEsV0FBQSxDQUFBLGNBQUE7QUFDQSxNQUFBLEVBQUEsV0FBQSxDQUFBLGNBQUE7R0FDQSxDQUFBO0FBQ0EsU0FBQTtBQUNBLGdCQUFBLEVBQUEsdUJBQUEsUUFBQSxFQUFBO0FBQ0EsY0FBQSxDQUFBLFVBQUEsQ0FBQSxVQUFBLENBQUEsUUFBQSxDQUFBLE1BQUEsQ0FBQSxFQUFBLFFBQUEsQ0FBQSxDQUFBO0FBQ0EsV0FBQSxFQUFBLENBQUEsTUFBQSxDQUFBLFFBQUEsQ0FBQSxDQUFBO0lBQ0E7R0FDQSxDQUFBO0VBQ0EsQ0FBQSxDQUFBOztBQUVBLElBQUEsQ0FBQSxNQUFBLENBQUEsVUFBQSxhQUFBLEVBQUE7QUFDQSxlQUFBLENBQUEsWUFBQSxDQUFBLElBQUEsQ0FBQSxDQUNBLFdBQUEsRUFDQSxVQUFBLFNBQUEsRUFBQTtBQUNBLFVBQUEsU0FBQSxDQUFBLEdBQUEsQ0FBQSxpQkFBQSxDQUFBLENBQUE7R0FDQSxDQUNBLENBQUEsQ0FBQTtFQUNBLENBQUEsQ0FBQTtBQUNBLElBQUEsQ0FBQSxPQUFBLENBQUEsYUFBQSxFQUFBLFVBQUEsS0FBQSxFQUFBLE9BQUEsRUFBQSxVQUFBLEVBQUEsV0FBQSxFQUFBLEVBQUEsRUFBQTs7QUFFQSxXQUFBLGlCQUFBLENBQUEsUUFBQSxFQUFBO0FBQ0EsT0FBQSxJQUFBLEdBQUEsUUFBQSxDQUFBLElBQUEsQ0FBQTtBQUNBLFVBQUEsQ0FBQSxNQUFBLENBQUEsSUFBQSxDQUFBLEVBQUEsRUFBQSxJQUFBLENBQUEsSUFBQSxDQUFBLENBQUE7QUFDQSxhQUFBLENBQUEsVUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsQ0FBQTtBQUNBLFVBQUEsSUFBQSxDQUFBLElBQUEsQ0FBQTtHQUNBOzs7O0FBSUEsTUFBQSxDQUFBLGVBQUEsR0FBQSxZQUFBO0FBQ0EsVUFBQSxDQUFBLENBQUEsT0FBQSxDQUFBLElBQUEsQ0FBQTtHQUNBLENBQUE7O0FBRUEsTUFBQSxDQUFBLGVBQUEsR0FBQSxVQUFBLFVBQUEsRUFBQTs7Ozs7Ozs7OztBQVVBLE9BQUEsSUFBQSxDQUFBLGVBQUEsRUFBQSxJQUFBLFVBQUEsS0FBQSxJQUFBLEVBQUE7QUFDQSxXQUFBLEVBQUEsQ0FBQSxJQUFBLENBQUEsT0FBQSxDQUFBLElBQUEsQ0FBQSxDQUFBO0lBQ0E7Ozs7O0FBS0EsVUFBQSxLQUFBLENBQUEsR0FBQSxDQUFBLFVBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBQSxpQkFBQSxDQUFBLFNBQUEsQ0FBQSxZQUFBO0FBQ0EsV0FBQSxJQUFBLENBQUE7SUFDQSxDQUFBLENBQUE7R0FFQSxDQUFBOztBQUVBLE1BQUEsQ0FBQSxLQUFBLEdBQUEsVUFBQSxXQUFBLEVBQUE7QUFDQSxVQUFBLEtBQUEsQ0FBQSxJQUFBLENBQUEsUUFBQSxFQUFBLFdBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxpQkFBQSxDQUFBLFNBQ0EsQ0FBQSxZQUFBO0FBQ0EsV0FBQSxFQUFBLENBQUEsTUFBQSxDQUFBLEVBQUEsT0FBQSxFQUFBLDRCQUFBLEVBQUEsQ0FBQSxDQUFBO0lBQ0EsQ0FBQSxDQUFBO0dBQ0EsQ0FBQTs7QUFHQSxNQUFBLENBQUEsTUFBQSxHQUFBLFVBQUEsV0FBQSxFQUFBOztBQUVBLFVBQUEsS0FBQSxDQUFBLElBQUEsQ0FBQSxrQkFBQSxFQUFBLFdBQUEsQ0FBQTs7SUFFQSxJQUFBLENBQUEsVUFBQSxRQUFBLEVBQUE7O0FBRUEsV0FBQSxLQUFBLENBQUEsSUFBQSxDQUFBLFFBQUEsRUFBQSxXQUFBLENBQUEsQ0FBQTtJQUNBLENBQUEsQ0FDQSxJQUFBLENBQUEsaUJBQUEsQ0FBQSxTQUNBLENBQUEsWUFBQTtBQUNBLFdBQUEsRUFBQSxDQUFBLE1BQUEsQ0FBQSxFQUFBLE9BQUEsRUFBQSw2QkFBQSxFQUFBLENBQUEsQ0FBQTtJQUNBLENBQUEsQ0FBQTtHQUNBLENBQUE7O0FBRUEsTUFBQSxDQUFBLE1BQUEsR0FBQSxZQUFBO0FBQ0EsVUFBQSxLQUFBLENBQUEsR0FBQSxDQUFBLFNBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBQSxZQUFBO0FBQ0EsV0FBQSxDQUFBLE9BQUEsRUFBQSxDQUFBO0FBQ0EsY0FBQSxDQUFBLFVBQUEsQ0FBQSxXQUFBLENBQUEsYUFBQSxDQUFBLENBQUE7SUFDQSxDQUFBLENBQUE7R0FDQSxDQUFBO0VBRUEsQ0FBQSxDQUFBOztBQUVBLElBQUEsQ0FBQSxPQUFBLENBQUEsU0FBQSxFQUFBLFVBQUEsVUFBQSxFQUFBLFdBQUEsRUFBQTs7QUFFQSxNQUFBLElBQUEsR0FBQSxJQUFBLENBQUE7O0FBRUEsWUFBQSxDQUFBLEdBQUEsQ0FBQSxXQUFBLENBQUEsZ0JBQUEsRUFBQSxZQUFBO0FBQ0EsT0FBQSxDQUFBLE9BQUEsRUFBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBOztBQUVBLFlBQUEsQ0FBQSxHQUFBLENBQUEsV0FBQSxDQUFBLGNBQUEsRUFBQSxZQUFBO0FBQ0EsT0FBQSxDQUFBLE9BQUEsRUFBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBOztBQUVBLE1BQUEsQ0FBQSxFQUFBLEdBQUEsSUFBQSxDQUFBO0FBQ0EsTUFBQSxDQUFBLElBQUEsR0FBQSxJQUFBLENBQUE7O0FBRUEsTUFBQSxDQUFBLE1BQUEsR0FBQSxVQUFBLFNBQUEsRUFBQSxJQUFBLEVBQUE7QUFDQSxPQUFBLENBQUEsRUFBQSxHQUFBLFNBQUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxJQUFBLEdBQUEsSUFBQSxDQUFBO0dBQ0EsQ0FBQTs7QUFFQSxNQUFBLENBQUEsT0FBQSxHQUFBLFlBQUE7QUFDQSxPQUFBLENBQUEsRUFBQSxHQUFBLElBQUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxJQUFBLEdBQUEsSUFBQSxDQUFBO0dBQ0EsQ0FBQTtFQUVBLENBQUEsQ0FBQTtDQUVBLENBQUEsRUFBQSxDQUFBOztBQ2xKQSxHQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsY0FBQSxFQUFBOztBQUVBLGVBQUEsQ0FBQSxLQUFBLENBQUEsTUFBQSxFQUFBO0FBQ0EsS0FBQSxFQUFBLEdBQUE7QUFDQSxhQUFBLEVBQUEsbUJBQUE7QUFDQSxZQUFBLEVBQUEsVUFBQTtBQUNBLFNBQUEsRUFBQTtBQUNBLGdCQUFBLEVBQUEsdUJBQUEsV0FBQSxFQUFBO0FBQ0EsV0FBQSxXQUFBLENBQUEsZUFBQSxFQUFBLENBQUE7SUFDQTtHQUNBO0VBQ0EsQ0FBQSxDQUFBO0NBRUEsQ0FBQSxDQUFBOztBQUVBLEdBQUEsQ0FBQSxVQUFBLENBQUEsVUFBQSxFQUFBLFVBQUEsTUFBQSxFQUFBLFdBQUEsRUFBQSxNQUFBLEVBQUEsYUFBQSxFQUFBOztBQUVBLEtBQUEsYUFBQSxFQUFBLE1BQUEsQ0FBQSxFQUFBLENBQUEsV0FBQSxFQUFBLEVBQUEsTUFBQSxFQUFBLGFBQUEsQ0FBQSxHQUFBLEVBQUEsQ0FBQSxDQUFBOztBQUVBLE9BQUEsQ0FBQSxJQUFBLEdBQUEsSUFBQSxDQUFBO0FBQ0EsT0FBQSxDQUFBLEtBQUEsR0FBQSxFQUFBLENBQUE7QUFDQSxPQUFBLENBQUEsTUFBQSxHQUFBLEVBQUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxVQUFBLEdBQUEsSUFBQSxDQUFBO0FBQ0EsT0FBQSxDQUFBLFdBQUEsR0FBQSxJQUFBLENBQUE7O0FBRUEsT0FBQSxDQUFBLFNBQUEsR0FBQSxVQUFBLFNBQUEsRUFBQTtBQUNBLFFBQUEsQ0FBQSxLQUFBLEdBQUEsSUFBQSxDQUFBOztBQUVBLGFBQUEsQ0FBQSxLQUFBLENBQUEsU0FBQSxDQUFBLENBQUEsSUFBQSxDQUFBLFVBQUEsSUFBQSxFQUFBO0FBQ0EsU0FBQSxDQUFBLEVBQUEsQ0FBQSxXQUFBLEVBQUEsRUFBQSxNQUFBLEVBQUEsSUFBQSxDQUFBLEdBQUEsRUFBQSxDQUFBLENBQUE7R0FDQSxDQUFBLFNBQUEsQ0FBQSxZQUFBO0FBQ0EsU0FBQSxDQUFBLFVBQUEsR0FBQSxnREFBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBO0VBRUEsQ0FBQTs7QUFFQSxPQUFBLENBQUEsVUFBQSxHQUFBLFVBQUEsVUFBQSxFQUFBO0FBQ0EsUUFBQSxDQUFBLEtBQUEsR0FBQSxJQUFBLENBQUE7QUFDQSxhQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBQSxVQUFBLElBQUEsRUFBQTtBQUNBLFNBQUEsQ0FBQSxFQUFBLENBQUEsV0FBQSxFQUFBLEVBQUEsTUFBQSxFQUFBLElBQUEsQ0FBQSxHQUFBLEVBQUEsRUFBQSxFQUFBLE1BQUEsRUFBQSxJQUFBLEVBQUEsQ0FBQSxDQUFBO0dBQ0EsQ0FBQSxTQUFBLENBQUEsWUFBQTtBQUNBLFNBQUEsQ0FBQSxXQUFBLEdBQUEsaURBQUEsQ0FBQTtHQUNBLENBQUEsQ0FBQTtFQUNBLENBQUE7OztBQUdBLEVBQUEsQ0FBQSxZQUFBOztBQUVBLE1BQUEsT0FBQSxHQUFBLENBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQTs7QUFFQSxHQUFBLENBQUEsaUNBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBQSxZQUFBO0FBQ0EsT0FBQSxNQUFBLEdBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBQSxDQUFBO0FBQ0EsSUFBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBLE1BQUEsQ0FBQSxZQUFBOzs7QUFHQSxRQUFBLElBQUEsR0FBQSxFQUFBLE9BQUEsQ0FBQSxTQUFBLEVBQUEsR0FBQSxNQUFBLENBQUEsSUFBQSxDQUFBLE9BQUEsQ0FBQSxDQUFBLENBQUE7O0FBRUEsUUFBQSxNQUFBLEdBQUEsTUFBQSxHQUFBLElBQUEsR0FBQSxJQUFBLENBQUE7O0FBRUEsVUFBQSxDQUFBLEdBQUEsQ0FBQSxFQUFBLGtCQUFBLEVBQUEsTUFBQSxFQUFBLENBQUEsQ0FBQTtJQUNBLENBQUEsQ0FBQTtHQUNBLENBQUEsQ0FBQTtFQUNBLENBQUEsQ0FBQTtDQUlBLENBQUEsQ0FBQTtBQ2xFQSxHQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsY0FBQSxFQUFBO0FBQ0EsZUFBQSxDQUFBLEtBQUEsQ0FBQSxRQUFBLEVBQ0E7QUFDQSxLQUFBLEVBQUEsYUFBQTtBQUNBLGFBQUEsRUFBQSw2QkFBQTtBQUNBLFlBQUEsRUFBQSxZQUFBO0FBQ0EsU0FBQSxFQUFBO0FBQ0EsUUFBQSxFQUFBLGVBQUEsWUFBQSxFQUFBLFlBQUEsRUFBQTtBQUNBLFdBQUEsWUFBQSxDQUFBLEVBQUEsS0FBQSxFQUFBLEdBQ0EsWUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsRUFBQSxDQUFBLEdBQ0EsU0FBQSxDQUFBO0lBQ0E7R0FDQTtBQUNBLE1BQUEsRUFBQTtBQUNBLGVBQUEsRUFBQSxJQUFBO0dBQ0E7RUFDQSxDQUFBLENBQUE7Q0FDQSxDQUFBLENBQUE7O0FBRUEsR0FBQSxDQUFBLFVBQUEsQ0FBQSxZQUFBLEVBQUEsVUFBQSxNQUFBLEVBQUEsWUFBQSxFQUFBLFNBQUEsRUFBQSxNQUFBLEVBQUEsVUFBQSxFQUFBLEtBQUEsRUFBQSxPQUFBLEVBQUEsWUFBQSxFQUFBLFdBQUEsRUFBQTs7QUFFQSxXQUFBLENBQUEsYUFBQSxHQUFBLElBQUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxLQUFBLEdBQUEsS0FBQSxDQUFBO0FBQ0EsT0FBQSxDQUFBLFdBQUEsR0FBQSxJQUFBLENBQUE7QUFDQSxPQUFBLENBQUEsUUFBQSxHQUFBLEtBQUEsQ0FBQTs7QUFFQSxLQUFBLENBQUEsS0FBQSxFQUFBO0FBQ0EsUUFBQSxDQUFBLFFBQUEsR0FBQSxJQUFBLENBQUE7QUFDQSxRQUFBLENBQUEsS0FBQSxHQUFBO0FBQ0EsUUFBQSxFQUFBLENBQUEsU0FBQSxFQUFBLENBQUEsVUFBQSxDQUFBO0dBQ0EsQ0FBQTtFQUNBOzs7QUFHQSxPQUFBLENBQUEsU0FBQSxHQUFBLFlBQUE7O0FBRUEsT0FBQSxDQUFBLFVBQUEsR0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLE1BQUEsQ0FBQSxVQUFBLElBQUEsRUFBQTtBQUNBLFVBQUEsSUFBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLENBQUEsTUFBQSxJQUFBLElBQUEsQ0FBQSxjQUFBLENBQUEsS0FBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBOztBQUVBLE1BQUEsQ0FBQSxNQUFBLENBQUEsUUFBQSxFQUFBO0FBQ0EsVUFBQSxZQUFBLENBQUEsSUFBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsWUFBQTtBQUNBLFVBQUEsQ0FBQSxFQUFBLENBQUEsV0FBQSxFQUFBLEVBQUEsTUFBQSxFQUFBLE9BQUEsQ0FBQSxJQUFBLENBQUEsR0FBQSxFQUFBLENBQUEsQ0FBQTtJQUNBLENBQUEsQ0FBQTtHQUNBLE1BQUE7QUFDQSxVQUFBLFlBQUEsQ0FBQSxPQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxZQUFBO0FBQ0EsVUFBQSxDQUFBLEVBQUEsQ0FBQSxXQUFBLEVBQUEsRUFBQSxNQUFBLEVBQUEsT0FBQSxDQUFBLElBQUEsQ0FBQSxHQUFBLEVBQUEsQ0FBQSxDQUFBO0lBQ0EsQ0FBQSxDQUFBO0dBQ0E7RUFDQSxDQUFBOztBQUVBLE9BQUEsQ0FBQSwwQkFBQSxHQUFBLFlBQUE7QUFDQSxNQUFBLENBQUEsTUFBQSxDQUFBLFFBQUEsRUFBQTtBQUNBLFVBQUEsWUFBQSxDQUFBLElBQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFlBQUE7QUFDQSxRQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLE1BQUEsS0FBQSxDQUFBLEVBQUE7QUFDQSxXQUFBLENBQUEsRUFBQSxDQUFBLGtCQUFBLEVBQUEsRUFBQSxXQUFBLEVBQUEsSUFBQSxFQUFBLENBQUEsQ0FBQTtLQUNBLE1BQUE7QUFDQSxXQUFBLENBQUEsRUFBQSxDQUFBLGtCQUFBLEVBQUEsRUFBQSxXQUFBLEVBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsQ0FBQSxDQUFBLENBQUEsR0FBQSxFQUFBLENBQUEsQ0FBQTtLQUNBO0FBQ0EsVUFBQSxDQUFBLGFBQUEsR0FBQSxLQUFBLENBQUE7SUFDQSxDQUFBLENBQUE7R0FDQSxNQUFBO0FBQ0EsVUFBQSxZQUFBLENBQUEsT0FBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsVUFBQSxVQUFBLEVBQUE7QUFDQSxVQUFBLENBQUEsYUFBQSxHQUFBLEtBQUEsQ0FBQTtBQUNBLFVBQUEsQ0FBQSxFQUFBLENBQUEsa0JBQUEsRUFBQSxFQUFBLEVBQUEsRUFBQSxVQUFBLENBQUEsR0FBQSxFQUFBLFdBQUEsRUFBQSxJQUFBLEVBQUEsQ0FBQSxDQUFBO0lBQ0EsQ0FBQSxDQUFBO0dBQ0E7RUFDQSxDQUFBOztBQUVBLE9BQUEsQ0FBQSxNQUFBLEdBQUEsWUFBQTtBQUNBLGFBQUEsQ0FBQSxNQUFBLEVBQUEsQ0FBQSxJQUFBLENBQUEsWUFBQTtBQUNBLFNBQUEsQ0FBQSxFQUFBLENBQUEsTUFBQSxDQUFBLENBQUE7R0FDQSxDQUFBLENBQUE7RUFDQSxDQUFBOzs7QUFHQSxLQUFBLFlBQUEsQ0FBQTtBQUNBLEtBQUEsYUFBQSxHQUFBLEVBQUEsQ0FBQTtBQUNBLEtBQUEsYUFBQSxHQUFBLEVBQUEsQ0FBQTtBQUNBLEtBQUEsUUFBQSxHQUFBLENBQUEsQ0FBQSxHQUFBLENBQUEsV0FBQSxDQUFBLENBQUEsT0FBQSxDQUFBLENBQUEsU0FBQSxFQUFBLENBQUEsVUFBQSxDQUFBLEVBQUEsRUFBQSxDQUFBLENBQUE7QUFDQSxTQUFBLENBQUEsZUFBQSxDQUFBLE9BQUEsRUFBQSxDQUFBO0FBQ0EsRUFBQSxDQUFBLFNBQUEsQ0FBQSxpRkFBQSxFQUFBO0FBQ0EsU0FBQSxFQUFBLEVBQUE7QUFDQSxJQUFBLEVBQUEsb0JBQUE7QUFDQSxhQUFBLEVBQUEsOEZBQUE7RUFDQSxDQUFBLENBQUEsS0FBQSxDQUFBLFFBQUEsQ0FBQSxDQUFBOzs7QUFHQSxLQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxDQUFBLENBQUEsQ0FBQSxZQUFBLEVBQUE7O0FBRUEsVUFBQSxDQUFBLE1BQUEsRUFBQSxDQUFBLEVBQUEsQ0FBQSxlQUFBLEVBQUEsVUFBQSxDQUFBLEVBQUE7QUFDQSxlQUFBLEdBQUEsQ0FBQSxDQUFBLENBQUEsUUFBQSxFQUFBLENBQUEsQ0FBQSxTQUFBLENBQUEsQ0FBQTtBQUNBLFdBQUEsQ0FBQSxPQUFBLENBQUEsWUFBQSxFQUFBLEVBQUEsQ0FBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBO0VBQ0E7OztBQUdBLFVBQUEsV0FBQSxHQUFBOztBQUVBLGVBQUEsQ0FBQSxPQUFBLENBQUEsVUFBQSxNQUFBLEVBQUE7QUFDQSxXQUFBLENBQUEsV0FBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBOztBQUVBLE1BQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsTUFBQSxFQUFBO0FBQ0EsU0FBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsT0FBQSxDQUFBLFVBQUEsSUFBQSxFQUFBLEtBQUEsRUFBQTtBQUNBLFFBQUEsSUFBQSxDQUFBLFlBQUEsSUFBQSxJQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsQ0FBQSxNQUFBLEVBQUE7QUFDQSxTQUFBLE1BQUEsR0FBQSxJQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsQ0FBQTtBQUNBLFNBQUEsTUFBQSxHQUFBLElBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxDQUFBO0FBQ0EsU0FBQSxNQUFBLEdBQUEsQ0FBQSxDQUFBLE1BQUEsQ0FBQSxNQUFBLEVBQUEsTUFBQSxDQUFBLENBQUE7QUFDQSxXQUFBLENBQUEsU0FBQSxDQUFBLENBQUEsS0FBQSxHQUFBLENBQUEsQ0FBQSxDQUFBLFFBQUEsRUFBQSxFQUFBLEVBQUEsTUFBQSxFQUFBLElBQUEsRUFBQSxDQUFBLENBQUEsS0FBQSxDQUFBLFFBQUEsQ0FBQSxDQUFBO0FBQ0Esa0JBQUEsQ0FBQSxJQUFBLENBQUEsTUFBQSxDQUFBLENBQUE7QUFDQSxrQkFBQSxDQUFBLElBQUEsQ0FBQSxJQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBO0tBQ0E7SUFDQSxDQUFBLENBQUE7QUFDQSxXQUFBLENBQUEsU0FBQSxDQUFBLGFBQUEsQ0FBQSxDQUFBO0dBQ0E7RUFDQTtBQUNBLFlBQUEsRUFBQSxDQUFBO0NBRUEsQ0FBQSxDQUFBOztBQzNIQSxHQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsY0FBQSxFQUFBO0FBQ0EsZUFBQSxDQUFBLEtBQUEsQ0FBQSxrQkFBQSxFQUFBO0FBQ0EsS0FBQSxFQUFBLHlCQUFBO0FBQ0EsYUFBQSxFQUFBLDZDQUFBO0FBQ0EsWUFBQSxFQUFBLG1CQUFBO0FBQ0EsU0FBQSxFQUFBO0FBQ0EsUUFBQSxFQUFBLGVBQUEsWUFBQSxFQUFBLFlBQUEsRUFBQTtBQUNBLFdBQUEsWUFBQSxDQUFBLEVBQUEsS0FBQSxFQUFBLEdBQ0EsWUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsRUFBQSxDQUFBLEdBQ0EsU0FBQSxDQUFBO0lBQ0E7R0FDQTtBQUNBLE1BQUEsRUFBQTtBQUNBLGVBQUEsRUFBQSxJQUFBO0dBQ0E7RUFDQSxDQUFBLENBQUE7Q0FDQSxDQUFBLENBQUE7O0FBR0EsR0FBQSxDQUFBLFVBQUEsQ0FBQSxtQkFBQSxFQUFBLFVBQUEsWUFBQSxFQUFBLE1BQUEsRUFBQSxNQUFBLEVBQUEsVUFBQSxFQUFBLEtBQUEsRUFBQSxZQUFBLEVBQUE7QUFDQSxPQUFBLENBQUEsS0FBQSxHQUFBLEtBQUEsQ0FBQTtBQUNBLFdBQUEsQ0FBQSxhQUFBLEdBQUEsS0FBQSxDQUFBO0FBQ0EsT0FBQSxDQUFBLE9BQUEsR0FBQSxJQUFBLENBQUE7QUFDQSxLQUFBLFlBQUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxXQUFBLEdBQUEsS0FBQSxDQUFBO0FBQ0EsT0FBQSxDQUFBLFVBQUEsR0FBQSxLQUFBLENBQUE7OztBQUdBLE9BQUEsQ0FBQSxPQUFBLEdBQUE7QUFDQSxNQUFBLEVBQUEsVUFBQTtBQUNBLGNBQUEsRUFBQTtBQUNBLFNBQUEsRUFBQSxFQUFBO0FBQ0EsU0FBQSxFQUFBLElBQUE7R0FDQTtFQUNBLENBQUE7O0FBRUEsS0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxNQUFBLEdBQUEsQ0FBQSxFQUFBO0FBQ0EsUUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsT0FBQSxDQUFBLFVBQUEsSUFBQSxFQUFBLEtBQUEsRUFBQTtBQUNBLE9BQUEsSUFBQSxDQUFBLEdBQUEsS0FBQSxZQUFBLENBQUEsV0FBQSxFQUFBO0FBQ0EsVUFBQSxDQUFBLEtBQUEsQ0FBQSxHQUFBLEdBQUEsS0FBQSxDQUFBO0lBQ0E7R0FDQSxDQUFBLENBQUE7O0FBRUEsUUFBQSxDQUFBLFdBQUEsR0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLEdBQUEsQ0FBQSxDQUFBO0VBQ0EsTUFBQTtBQUNBLFFBQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLElBQUEsQ0FBQSxNQUFBLENBQUEsT0FBQSxDQUFBLENBQUE7QUFDQSxRQUFBLENBQUEsV0FBQSxHQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLENBQUEsQ0FBQSxDQUFBO0VBQ0E7O0FBRUEsT0FBQSxDQUFBLFVBQUEsR0FBQSxVQUFBLFdBQUEsRUFBQTtBQUNBLE1BQUEsTUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxDQUFBLE1BQUEsSUFBQSxNQUFBLENBQUEsV0FBQSxDQUFBLGNBQUEsSUFBQSxNQUFBLENBQUEsV0FBQSxDQUFBLGNBQUEsQ0FBQSxLQUFBLEVBQUE7QUFDQSxlQUFBLENBQUEsSUFBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsWUFBQTs7QUFFQSxVQUFBLENBQUEsRUFBQSxDQUFBLGtCQUFBLEVBQUEsRUFBQSxXQUFBLEVBQUEsV0FBQSxDQUFBLEdBQUEsRUFBQSxDQUFBLENBQUE7SUFDQSxDQUFBLENBQUE7R0FDQSxNQUFBO0FBQ0EsT0FBQSxDQUFBLE1BQUEsQ0FBQSxXQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsQ0FBQSxNQUFBLEVBQUEsVUFBQSxDQUFBLGFBQUEsQ0FBQSxDQUFBO0FBQ0EsT0FBQSxDQUFBLE1BQUEsQ0FBQSxXQUFBLENBQUEsY0FBQSxJQUFBLENBQUEsTUFBQSxDQUFBLFdBQUEsQ0FBQSxjQUFBLENBQUEsS0FBQSxFQUFBLFVBQUEsQ0FBQSxZQUFBLENBQUEsQ0FBQTtHQUNBO0VBQ0EsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxjQUFBLEdBQUEsWUFBQTtBQUNBLE1BQUEsTUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxDQUFBLE1BQUEsRUFBQTs7QUFFQSxlQUFBLENBQUEsSUFBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsVUFBQSxZQUFBLEVBQUE7QUFDQSxVQUFBLENBQUEsS0FBQSxHQUFBLFlBQUEsQ0FBQTtBQUNBLFVBQUEsQ0FBQSxFQUFBLENBQUEsUUFBQSxFQUFBLEVBQUEsRUFBQSxFQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsR0FBQSxFQUFBLEVBQUEsRUFBQSxNQUFBLEVBQUEsSUFBQSxFQUFBLENBQUEsQ0FBQTtJQUNBLENBQUEsQ0FBQTtHQUNBLE1BQUEsVUFBQSxDQUFBLGFBQUEsQ0FBQSxDQUFBO0VBQ0EsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxZQUFBLEdBQUEsWUFBQTtBQUNBLFFBQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLElBQUEsQ0FBQSxNQUFBLENBQUEsT0FBQSxDQUFBLENBQUE7QUFDQSxTQUFBLFlBQUEsQ0FBQSxJQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxVQUFBLFlBQUEsRUFBQTtBQUNBLFNBQUEsQ0FBQSxLQUFBLEdBQUEsWUFBQSxDQUFBO0FBQ0EsU0FBQSxDQUFBLEVBQUEsQ0FBQSxrQkFBQSxFQUFBLEVBQUEsV0FBQSxFQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLE1BQUEsR0FBQSxDQUFBLENBQUEsQ0FBQSxHQUFBLEVBQUEsQ0FBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBO0VBRUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxlQUFBLEdBQUEsWUFBQTtBQUNBLE1BQUEsS0FBQSxHQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLE9BQUEsQ0FBQSxNQUFBLENBQUEsV0FBQSxDQUFBLENBQUE7QUFDQSxRQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxFQUFBLENBQUEsQ0FBQSxDQUFBO0FBQ0EsTUFBQSxLQUFBLEtBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsTUFBQSxFQUFBLEtBQUEsRUFBQSxDQUFBO0FBQ0EsU0FBQSxZQUFBLENBQUEsSUFBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsVUFBQSxZQUFBLEVBQUE7QUFDQSxTQUFBLENBQUEsS0FBQSxHQUFBLFlBQUEsQ0FBQTtBQUNBLE9BQUEsZUFBQSxHQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLE1BQUEsS0FBQSxDQUFBLEdBQUEsSUFBQSxHQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLEtBQUEsQ0FBQSxDQUFBLEdBQUEsQ0FBQTtBQUNBLFNBQUEsQ0FBQSxFQUFBLENBQUEsa0JBQUEsRUFBQSxFQUFBLFdBQUEsRUFBQSxlQUFBLEVBQUEsRUFBQSxFQUFBLE1BQUEsRUFBQSxJQUFBLEVBQUEsQ0FBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBO0VBQ0EsQ0FBQTs7QUFFQSxVQUFBLFVBQUEsQ0FBQSxTQUFBLEVBQUE7QUFDQSxRQUFBLENBQUEsU0FBQSxDQUFBLEdBQUEsSUFBQSxDQUFBO0FBQ0EsWUFBQSxDQUFBLFlBQUE7QUFDQSxTQUFBLENBQUEsU0FBQSxDQUFBLEdBQUEsS0FBQSxDQUFBO0FBQ0EsU0FBQSxDQUFBLE9BQUEsRUFBQSxDQUFBO0dBQ0EsRUFBQSxJQUFBLENBQUEsQ0FBQTtFQUNBOzs7OztBQU1BLEtBQUEsWUFBQSxHQUFBLENBQUEsQ0FBQSxHQUFBLENBQUEsZ0JBQUEsQ0FBQSxDQUFBO0FBQ0EsYUFBQSxDQUFBLGVBQUEsQ0FBQSxPQUFBLEVBQUEsQ0FBQTs7QUFFQSxFQUFBLENBQUEsU0FBQSxDQUFBLGlGQUFBLEVBQUE7QUFDQSxTQUFBLEVBQUEsRUFBQTtBQUNBLElBQUEsRUFBQSxvQkFBQTtBQUNBLGFBQUEsRUFBQSw4RkFBQTtFQUNBLENBQUEsQ0FBQSxLQUFBLENBQUEsWUFBQSxDQUFBLENBQUE7Ozs7O0FBS0EsS0FBQSxNQUFBLENBQUEsV0FBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLENBQUEsTUFBQSxLQUFBLENBQUEsRUFBQTtBQUNBLGNBQUEsQ0FBQSxPQUFBLENBQUEsTUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxFQUFBLEVBQUEsQ0FBQSxDQUFBO0VBQ0EsTUFBQSxJQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLENBQUEsQ0FBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLENBQUEsTUFBQSxLQUFBLENBQUEsRUFBQTtBQUNBLGNBQUEsQ0FBQSxPQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsQ0FBQSxDQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsRUFBQSxFQUFBLENBQUEsQ0FBQTtFQUNBLE1BQUE7QUFDQSxjQUFBLENBQUEsTUFBQSxFQUFBLENBQUEsRUFBQSxDQUFBLGVBQUEsRUFBQSxVQUFBLENBQUEsRUFBQTtBQUNBLGVBQUEsR0FBQSxDQUFBLENBQUEsQ0FBQSxRQUFBLEVBQUEsQ0FBQSxDQUFBLFNBQUEsQ0FBQSxDQUFBO0FBQ0EsZUFBQSxDQUFBLE9BQUEsQ0FBQSxZQUFBLEVBQUEsRUFBQSxDQUFBLENBQUE7R0FDQSxDQUFBLENBQUE7RUFDQTs7O0FBR0EsS0FBQSxVQUFBLEdBQUEsSUFBQSxDQUFBLENBQUEsWUFBQSxFQUFBLENBQUE7QUFDQSxhQUFBLENBQUEsUUFBQSxDQUFBLFVBQUEsQ0FBQSxDQUFBOzs7QUFHQSxLQUFBLFdBQUEsR0FBQSxJQUFBLENBQUEsQ0FBQSxPQUFBLENBQUEsSUFBQSxDQUFBO0FBQ0EsTUFBQSxFQUFBO0FBQ0EsV0FBQSxFQUFBLEtBQUE7QUFDQSxVQUFBLEVBQUEsS0FBQTtBQUNBLFlBQUEsRUFBQSxLQUFBO0FBQ0EsU0FBQSxFQUFBLEtBQUE7R0FDQTtBQUNBLE1BQUEsRUFBQTtBQUNBLGVBQUEsRUFBQSxVQUFBO0dBQ0E7RUFDQSxDQUFBLENBQUE7QUFDQSxhQUFBLENBQUEsVUFBQSxDQUFBLFdBQUEsQ0FBQSxDQUFBOztBQUVBLEtBQUEsTUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxDQUFBLE1BQUEsS0FBQSxDQUFBLEVBQUE7QUFDQSxNQUFBLGFBQUEsR0FBQSxDQUFBLENBQUEsTUFBQSxDQUFBLE1BQUEsQ0FBQSxXQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsRUFBQSxNQUFBLENBQUEsV0FBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQTtBQUNBLGNBQUEsQ0FBQSxRQUFBLENBQUEsYUFBQSxDQUFBLENBQUE7RUFDQTtBQUNBLEtBQUEsTUFBQSxDQUFBO0FBQ0EsYUFBQSxDQUFBLEVBQUEsQ0FBQSxjQUFBLEVBQUEsVUFBQSxDQUFBLEVBQUE7O0FBRUEsTUFBQSxhQUFBLEVBQUEsWUFBQSxDQUFBLFdBQUEsQ0FBQSxhQUFBLENBQUEsQ0FBQTtBQUNBLE1BQUEsTUFBQSxFQUFBLFlBQUEsQ0FBQSxXQUFBLENBQUEsTUFBQSxDQUFBLENBQUE7QUFDQSxNQUFBLElBQUEsR0FBQSxDQUFBLENBQUEsU0FBQSxDQUFBO0FBQ0EsTUFBQSxLQUFBLEdBQUEsQ0FBQSxDQUFBLEtBQUEsQ0FBQTs7QUFFQSxRQUFBLENBQUEsV0FBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLEdBQUEsQ0FBQSxLQUFBLENBQUEsT0FBQSxDQUFBLEdBQUEsRUFBQSxLQUFBLENBQUEsT0FBQSxDQUFBLEdBQUEsQ0FBQSxDQUFBO0FBQ0EsUUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxHQUFBLEtBQUEsQ0FBQSxRQUFBLENBQUE7O0FBRUEsUUFBQSxHQUFBLENBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQSxLQUFBLENBQUEsT0FBQSxDQUFBLEdBQUEsRUFBQSxLQUFBLENBQUEsT0FBQSxDQUFBLEdBQUEsQ0FBQSxFQUFBLEtBQUEsQ0FBQSxRQUFBLENBQUEsQ0FBQTtBQUNBLGNBQUEsQ0FBQSxRQUFBLENBQUEsTUFBQSxDQUFBLENBQUE7RUFDQSxDQUFBLENBQUE7O0FBRUEsT0FBQSxDQUFBLGtCQUFBLEdBQUEsWUFBQTtBQUNBLE1BQUEsTUFBQSxDQUFBLFdBQUEsSUFBQSxNQUFBLENBQUEsV0FBQSxDQUFBLGNBQUEsSUFBQSxNQUFBLENBQUEsV0FBQSxDQUFBLGNBQUEsQ0FBQSxRQUFBLEVBQUEsT0FBQSxTQUFBLENBQUE7QUFDQSxTQUFBLFNBQUEsQ0FBQTtFQUNBLENBQUE7Q0FDQSxDQUFBLENBQUE7O0FDeEtBLEdBQUEsQ0FBQSxNQUFBLENBQUEsVUFBQSxjQUFBLEVBQUE7QUFDQSxlQUFBLENBQUEsS0FBQSxDQUFBLFdBQUEsRUFBQTtBQUNBLEtBQUEsRUFBQSxvQkFBQTtBQUNBLGFBQUEsRUFBQSxrQ0FBQTtBQUNBLFlBQUEsRUFBQSxVQUFBO0FBQ0EsU0FBQSxFQUFBO0FBQ0EsYUFBQSxFQUFBLG9CQUFBLFlBQUEsRUFBQSxZQUFBLEVBQUE7QUFDQSxXQUFBLFlBQUEsQ0FBQSxhQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBO0lBQ0E7R0FDQTtBQUNBLE1BQUEsRUFBQTtBQUNBLGVBQUEsRUFBQSxJQUFBO0dBQ0E7RUFDQSxDQUFBLENBQUE7Q0FDQSxDQUFBLENBQUE7O0FBRUEsR0FBQSxDQUFBLFVBQUEsQ0FBQSxVQUFBLEVBQUEsVUFBQSxNQUFBLEVBQUEsTUFBQSxFQUFBLFVBQUEsRUFBQSxPQUFBLEVBQUEsWUFBQSxFQUFBO0FBQ0EsT0FBQSxDQUFBLFNBQUEsR0FBQSxJQUFBLENBQUE7QUFDQSxPQUFBLENBQUEsTUFBQSxHQUFBLEVBQUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxNQUFBLEdBQUEsVUFBQSxDQUFBLEdBQUEsQ0FBQSxVQUFBLENBQUEsRUFBQTtBQUNBLEdBQUEsQ0FBQSxVQUFBLEdBQUEsS0FBQSxDQUFBO0FBQ0EsU0FBQSxDQUFBLENBQUE7RUFDQSxDQUFBLENBQUE7O0FBRUEsT0FBQSxDQUFBLFVBQUEsR0FBQSxVQUFBLFlBQUEsRUFBQTtBQUNBLFFBQUEsQ0FBQSxFQUFBLENBQUEsUUFBQSxFQUFBLEVBQUEsRUFBQSxFQUFBLFlBQUEsQ0FBQSxHQUFBLEVBQUEsRUFBQSxFQUFBLE1BQUEsRUFBQSxJQUFBLEVBQUEsQ0FBQSxDQUFBO0VBQ0EsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxXQUFBLEdBQUEsVUFBQSxZQUFBLEVBQUE7QUFDQSxTQUFBLFlBQUEsVUFBQSxDQUFBLFlBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxVQUFBLFlBQUEsRUFBQTtBQUNBLFNBQUEsQ0FBQSxFQUFBLENBQUEsV0FBQSxFQUFBLEVBQUEsTUFBQSxFQUFBLE9BQUEsQ0FBQSxJQUFBLENBQUEsR0FBQSxFQUFBLEVBQUEsRUFBQSxNQUFBLEVBQUEsSUFBQSxFQUFBLENBQUEsQ0FBQTtHQUNBLENBQUEsQ0FBQTtFQUNBLENBQUE7QUFDQSxPQUFBLENBQUEsV0FBQSxHQUFBLFVBQUEsS0FBQSxFQUFBO0FBQ0EsTUFBQSxLQUFBLEdBQUEsTUFBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxVQUFBLEdBQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBO0VBQ0EsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxZQUFBLEdBQUEsVUFBQSxZQUFBLEVBQUE7QUFDQSxjQUFBLENBQUEsSUFBQSxDQUFBLFlBQUEsQ0FBQSxDQUFBO0VBQ0EsQ0FBQTtDQUNBLENBQUEsQ0FBQTs7QUN4Q0EsR0FBQSxDQUFBLE9BQUEsQ0FBQSxjQUFBLEVBQUEsVUFBQSxLQUFBLEVBQUEsT0FBQSxFQUFBOztBQUVBLFFBQUE7O0FBRUEsY0FBQSxFQUFBLHdCQUFBO0FBQ0EsVUFBQSxLQUFBLENBQUEsR0FBQSxDQUFBLGFBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxVQUFBLEdBQUEsRUFBQTtBQUNBLFdBQUEsR0FBQSxDQUFBLElBQUEsQ0FBQTtJQUNBLENBQUEsQ0FBQTtHQUNBO0FBQ0EsYUFBQSxFQUFBLHFCQUFBLE9BQUEsRUFBQTtBQUNBLFVBQUEsS0FBQSxDQUFBLEdBQUEsQ0FBQSxjQUFBLEdBQUEsT0FBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFVBQUEsR0FBQSxFQUFBO0FBQ0EsV0FBQSxHQUFBLENBQUEsSUFBQSxDQUFBO0lBQ0EsQ0FBQSxDQUFBO0dBQ0E7QUFDQSxlQUFBLEVBQUEsdUJBQUEsTUFBQSxFQUFBO0FBQ0EsVUFBQSxLQUFBLENBQUEsR0FBQSxDQUFBLHlCQUFBLEdBQUEsTUFBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFVBQUEsR0FBQSxFQUFBO0FBQ0EsV0FBQSxHQUFBLENBQUEsSUFBQSxDQUFBO0lBQ0EsQ0FBQSxDQUFBO0dBQ0E7QUFDQSxNQUFBLEVBQUEsY0FBQSxLQUFBLEVBQUE7QUFDQSxVQUFBLEtBQUEsQ0FBQSxHQUFBLENBQUEsY0FBQSxHQUFBLEtBQUEsQ0FBQSxHQUFBLEVBQUEsS0FBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFVBQUEsR0FBQSxFQUFBO0FBQ0EsV0FBQSxHQUFBLENBQUEsSUFBQSxDQUFBO0lBQ0EsQ0FBQSxDQUFBO0dBQ0E7QUFDQSxTQUFBLEVBQUEsaUJBQUEsS0FBQSxFQUFBO0FBQ0EsUUFBQSxDQUFBLE1BQUEsR0FBQSxPQUFBLENBQUEsSUFBQSxDQUFBLEdBQUEsQ0FBQTtBQUNBLFVBQUEsS0FBQSxDQUFBLElBQUEsQ0FBQSxjQUFBLEVBQUEsS0FBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFVBQUEsR0FBQSxFQUFBO0FBQ0EsV0FBQSxHQUFBLENBQUEsSUFBQSxDQUFBO0lBQ0EsQ0FBQSxDQUFBO0dBQ0E7QUFDQSxZQUFBLGlCQUFBLEtBQUEsRUFBQTtBQUNBLFVBQUEsS0FBQSxVQUFBLENBQUEsY0FBQSxHQUFBLEtBQUEsQ0FBQSxHQUFBLENBQUEsQ0FBQTtHQUNBO0VBQ0EsQ0FBQTtDQUNBLENBQUEsQ0FBQTs7QUN2Q0EsR0FBQSxDQUFBLFNBQUEsQ0FBQSxZQUFBLEVBQUEsVUFBQSxXQUFBLEVBQUEsTUFBQSxFQUFBOztBQUVBLFFBQUE7QUFDQSxVQUFBLEVBQUEsR0FBQTtBQUNBLE9BQUEsRUFBQTtBQUNBLE9BQUEsRUFBQSxHQUFBO0FBQ0EsUUFBQSxFQUFBLEdBQUE7R0FDQTtBQUNBLGFBQUEsRUFBQSxtREFBQTtBQUNBLE1BQUEsRUFBQSxjQUFBLEtBQUEsRUFBQTs7QUFFQSxRQUFBLENBQUEsSUFBQSxHQUFBLElBQUEsQ0FBQTs7QUFFQSxPQUFBLE9BQUEsR0FBQSxTQUFBLE9BQUEsR0FBQTtBQUNBLGVBQUEsQ0FBQSxlQUFBLEVBQUEsQ0FBQSxJQUFBLENBQUEsVUFBQSxJQUFBLEVBQUE7QUFDQSxVQUFBLENBQUEsSUFBQSxHQUFBLElBQUEsQ0FBQTtLQUNBLENBQUEsQ0FBQTtJQUNBLENBQUE7O0FBRUEsVUFBQSxFQUFBLENBQUE7O0FBRUEsUUFBQSxDQUFBLE1BQUEsR0FBQSxZQUFBO0FBQ0EsZUFBQSxDQUFBLE1BQUEsRUFBQSxDQUNBLElBQUEsQ0FBQSxZQUFBO0FBQ0EsV0FBQSxDQUFBLEVBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQTtLQUNBLENBQUEsQ0FBQTtJQUNBLENBQUE7R0FFQTtFQUNBLENBQUE7Q0FFQSxDQUFBLENBQUE7QUMvQkEsR0FBQSxDQUFBLFNBQUEsQ0FBQSxlQUFBLEVBQUEsWUFBQTtBQUNBLFFBQUE7QUFDQSxVQUFBLEVBQUEsR0FBQTtBQUNBLGFBQUEsRUFBQSx5REFBQTtFQUNBLENBQUE7Q0FDQSxDQUFBLENBQUE7QUNMQSxHQUFBLENBQUEsU0FBQSxDQUFBLGVBQUEsRUFBQSxVQUFBLFVBQUEsRUFBQSxRQUFBLEVBQUE7O0FBRUEsUUFBQTtBQUNBLFVBQUEsRUFBQSxHQUFBO0FBQ0EsU0FBQSxFQUFBLElBQUE7QUFDQSxVQUFBLEVBQUEsdUZBQUE7QUFDQSxNQUFBLEVBQUEsY0FBQSxLQUFBLEVBQUEsT0FBQSxFQUFBOztBQUVBLGFBQUEsQ0FBQSxHQUFBLENBQUEsbUJBQUEsRUFBQSxVQUFBLEtBQUEsRUFBQSxZQUFBLEVBQUEsYUFBQSxFQUFBO0FBQ0EsUUFBQSxhQUFBLEVBQUEsT0FBQTs7QUFFQSxZQUFBLENBQUEsWUFBQTtBQUNBLFlBQUEsQ0FBQSxXQUFBLENBQUEsU0FBQSxDQUFBLENBQUE7S0FDQSxDQUFBLENBQUE7SUFDQSxDQUFBLENBQUE7O0FBRUEsYUFBQSxDQUFBLEdBQUEsQ0FBQSxxQkFBQSxFQUFBLFlBQUE7QUFDQSxXQUFBLENBQUEsUUFBQSxDQUFBLFNBQUEsQ0FBQSxDQUFBO0lBQ0EsQ0FBQSxDQUFBO0dBQ0E7RUFDQSxDQUFBO0NBQ0EsQ0FBQSxDQUFBO0FDckJBLEdBQUEsQ0FBQSxTQUFBLENBQUEsUUFBQSxFQUFBLFVBQUEsVUFBQSxFQUFBLFdBQUEsRUFBQSxXQUFBLEVBQUEsTUFBQSxFQUFBOztBQUVBLFFBQUE7QUFDQSxVQUFBLEVBQUEsR0FBQTtBQUNBLE9BQUEsRUFBQTtBQUNBLE9BQUEsRUFBQSxHQUFBO0FBQ0EsWUFBQSxFQUFBLEdBQUE7R0FDQTtBQUNBLGFBQUEsRUFBQSx5Q0FBQTtBQUNBLE1BQUEsRUFBQSxjQUFBLEtBQUEsRUFBQTs7QUFFQSxRQUFBLENBQUEsS0FBQSxHQUFBLENBQ0EsRUFBQSxLQUFBLEVBQUEsV0FBQSxFQUFBLEtBQUEsRUFBQSxNQUFBLEVBQUEsSUFBQSxFQUFBLElBQUEsRUFBQSxFQUNBLEVBQUEsS0FBQSxFQUFBLFdBQUEsRUFBQSxLQUFBLEVBQUEsUUFBQSxFQUFBLElBQUEsRUFBQSxJQUFBLEVBQUEsQ0FDQSxDQUFBOztBQUVBLFFBQUEsQ0FBQSxJQUFBLEdBQUEsSUFBQSxDQUFBOztBQUVBLFFBQUEsQ0FBQSxVQUFBLEdBQUEsWUFBQTtBQUNBLFdBQUEsV0FBQSxDQUFBLGVBQUEsRUFBQSxDQUFBO0lBQ0EsQ0FBQTs7QUFFQSxPQUFBLE9BQUEsR0FBQSxTQUFBLE9BQUEsR0FBQTtBQUNBLGVBQUEsQ0FBQSxlQUFBLEVBQUEsQ0FBQSxJQUFBLENBQUEsVUFBQSxJQUFBLEVBQUE7QUFDQSxVQUFBLENBQUEsSUFBQSxHQUFBLElBQUEsQ0FBQTtLQUNBLENBQUEsQ0FBQTtJQUNBLENBQUE7O0FBRUEsT0FBQSxVQUFBLEdBQUEsU0FBQSxVQUFBLEdBQUE7QUFDQSxTQUFBLENBQUEsSUFBQSxHQUFBLElBQUEsQ0FBQTtJQUNBLENBQUE7O0FBRUEsVUFBQSxFQUFBLENBQUE7O0FBRUEsYUFBQSxDQUFBLEdBQUEsQ0FBQSxXQUFBLENBQUEsWUFBQSxFQUFBLE9BQUEsQ0FBQSxDQUFBO0FBQ0EsYUFBQSxDQUFBLEdBQUEsQ0FBQSxXQUFBLENBQUEsYUFBQSxFQUFBLFVBQUEsQ0FBQSxDQUFBO0FBQ0EsYUFBQSxDQUFBLEdBQUEsQ0FBQSxXQUFBLENBQUEsY0FBQSxFQUFBLFVBQUEsQ0FBQSxDQUFBOzs7QUFHQSxJQUFBLENBQUEsTUFBQSxDQUFBLENBQUEsTUFBQSxDQUFBLFlBQUE7QUFDQSxRQUFBLENBQUEsQ0FBQSxTQUFBLENBQUEsQ0FBQSxNQUFBLEVBQUEsQ0FBQSxHQUFBLEdBQUEsRUFBQSxJQUFBLEtBQUEsQ0FBQSxJQUFBLEVBQUE7QUFDQSxNQUFBLENBQUEsbUJBQUEsQ0FBQSxDQUFBLFFBQUEsQ0FBQSxrQkFBQSxDQUFBLENBQUE7QUFDQSxZQUFBLENBQUEsR0FBQSxDQUFBLGFBQUEsQ0FBQSxDQUFBO0tBQ0EsTUFBQSxJQUFBLEtBQUEsQ0FBQSxJQUFBLEVBQUE7QUFDQSxNQUFBLENBQUEsbUJBQUEsQ0FBQSxDQUFBLFdBQUEsQ0FBQSxrQkFBQSxDQUFBLENBQUE7QUFDQSxZQUFBLENBQUEsR0FBQSxDQUFBLFVBQUEsQ0FBQSxDQUFBO0tBQ0E7SUFDQSxDQUFBLENBQUE7OztBQUdBLElBQUEsQ0FBQSxZQUFBO0FBQ0EsS0FBQSxDQUFBLGdCQUFBLENBQUEsQ0FBQSxJQUFBLENBQUEsT0FBQSxFQUFBLFlBQUE7QUFDQSxTQUFBLE9BQUEsR0FBQSxDQUFBLENBQUEsSUFBQSxDQUFBLENBQUE7QUFDQSxNQUFBLENBQUEsWUFBQSxDQUFBLENBQUEsSUFBQSxFQUFBLENBQUEsT0FBQSxDQUFBO0FBQ0EsZUFBQSxFQUFBLENBQUEsQ0FBQSxPQUFBLENBQUEsSUFBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBLENBQUEsTUFBQSxFQUFBLENBQUEsR0FBQTtNQUNBLEVBQUEsSUFBQSxFQUFBLGVBQUEsQ0FBQSxDQUFBO0FBQ0EsVUFBQSxDQUFBLGNBQUEsRUFBQSxDQUFBO0tBQ0EsQ0FBQSxDQUFBO0lBQ0EsQ0FBQSxDQUFBO0dBRUE7O0VBRUEsQ0FBQTtDQUVBLENBQUEsQ0FBQSIsImZpbGUiOiJtYWluLmpzIiwic291cmNlc0NvbnRlbnQiOlsiJ3VzZSBzdHJpY3QnO1xud2luZG93LmFwcCA9IGFuZ3VsYXIubW9kdWxlKCdHZW9RdWVzdCcsIFsnZnNhUHJlQnVpbHQnLCAndWkucm91dGVyJywgJ3VpLnNvcnRhYmxlJywgJ3VpLmJvb3RzdHJhcCcsICduZ0FuaW1hdGUnLCAnbGVhZmxldC1kaXJlY3RpdmUnXSk7XG5cbmFwcC5jb25maWcoZnVuY3Rpb24gKCR1cmxSb3V0ZXJQcm92aWRlciwgJGxvY2F0aW9uUHJvdmlkZXIpIHtcbiAgICAvLyBUaGlzIHR1cm5zIG9mZiBoYXNoYmFuZyB1cmxzICgvI2Fib3V0KSBhbmQgY2hhbmdlcyBpdCB0byBzb21ldGhpbmcgbm9ybWFsICgvYWJvdXQpXG4gICAgJGxvY2F0aW9uUHJvdmlkZXIuaHRtbDVNb2RlKHRydWUpO1xuICAgIC8vIElmIHdlIGdvIHRvIGEgVVJMIHRoYXQgdWktcm91dGVyIGRvZXNuJ3QgaGF2ZSByZWdpc3RlcmVkLCBnbyB0byB0aGUgXCIvXCIgdXJsLlxuICAgICR1cmxSb3V0ZXJQcm92aWRlci5vdGhlcndpc2UoJy9kYXNoYm9hcmQnKTtcbn0pO1xuXG4vLyBUaGlzIGFwcC5ydW4gaXMgZm9yIGNvbnRyb2xsaW5nIGFjY2VzcyB0byBzcGVjaWZpYyBzdGF0ZXMuXG5hcHAucnVuKGZ1bmN0aW9uICgkcm9vdFNjb3BlLCBBdXRoU2VydmljZSwgJHN0YXRlKSB7XG5cbiAgICAvLyBUaGUgZ2l2ZW4gc3RhdGUgcmVxdWlyZXMgYW4gYXV0aGVudGljYXRlZCB1c2VyLlxuICAgIHZhciBkZXN0aW5hdGlvblN0YXRlUmVxdWlyZXNBdXRoID0gZnVuY3Rpb24gKHN0YXRlKSB7XG4gICAgICAgIHJldHVybiBzdGF0ZS5kYXRhICYmIHN0YXRlLmRhdGEuYXV0aGVudGljYXRlO1xuICAgIH07XG5cbiAgICAvLyAkc3RhdGVDaGFuZ2VTdGFydCBpcyBhbiBldmVudCBmaXJlZFxuICAgIC8vIHdoZW5ldmVyIHRoZSBwcm9jZXNzIG9mIGNoYW5naW5nIGEgc3RhdGUgYmVnaW5zLlxuICAgICRyb290U2NvcGUuJG9uKCckc3RhdGVDaGFuZ2VTdGFydCcsIGZ1bmN0aW9uIChldmVudCwgdG9TdGF0ZSwgdG9QYXJhbXMpIHtcblxuICAgICAgICBpZiAoIWRlc3RpbmF0aW9uU3RhdGVSZXF1aXJlc0F1dGgodG9TdGF0ZSkpIHtcbiAgICAgICAgICAgIC8vIFRoZSBkZXN0aW5hdGlvbiBzdGF0ZSBkb2VzIG5vdCByZXF1aXJlIGF1dGhlbnRpY2F0aW9uXG4gICAgICAgICAgICAvLyBTaG9ydCBjaXJjdWl0IHdpdGggcmV0dXJuLlxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKEF1dGhTZXJ2aWNlLmlzQXV0aGVudGljYXRlZCgpKSB7XG4gICAgICAgICAgICAvLyBUaGUgdXNlciBpcyBhdXRoZW50aWNhdGVkLlxuICAgICAgICAgICAgLy8gU2hvcnQgY2lyY3VpdCB3aXRoIHJldHVybi5cbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENhbmNlbCBuYXZpZ2F0aW5nIHRvIG5ldyBzdGF0ZS5cbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcblxuICAgICAgICBBdXRoU2VydmljZS5nZXRMb2dnZWRJblVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgICAgICAvLyBJZiBhIHVzZXIgaXMgcmV0cmlldmVkLCB0aGVuIHJlbmF2aWdhdGUgdG8gdGhlIGRlc3RpbmF0aW9uXG4gICAgICAgICAgICAvLyAodGhlIHNlY29uZCB0aW1lLCBBdXRoU2VydmljZS5pc0F1dGhlbnRpY2F0ZWQoKSB3aWxsIHdvcmspXG4gICAgICAgICAgICAvLyBvdGhlcndpc2UsIGlmIG5vIHVzZXIgaXMgbG9nZ2VkIGluLCBnbyB0byBcImxvZ2luXCIgc3RhdGUuXG4gICAgICAgICAgICBpZiAodXNlcikge1xuICAgICAgICAgICAgICAgICRzdGF0ZS5nbyh0b1N0YXRlLm5hbWUsIHRvUGFyYW1zKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgJHN0YXRlLmdvKCdsb2dpbicpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgIH0pO1xuXG59KTtcbiIsIihmdW5jdGlvbiAoKSB7XG5cbiAgICAndXNlIHN0cmljdCc7XG5cbiAgICAvLyBIb3BlIHlvdSBkaWRuJ3QgZm9yZ2V0IEFuZ3VsYXIhIER1aC1kb3kuXG4gICAgaWYgKCF3aW5kb3cuYW5ndWxhcikgdGhyb3cgbmV3IEVycm9yKCdJIGNhblxcJ3QgZmluZCBBbmd1bGFyIScpO1xuXG4gICAgdmFyIGFwcCA9IGFuZ3VsYXIubW9kdWxlKCdmc2FQcmVCdWlsdCcsIFtdKTtcblxuICAgIGFwcC5mYWN0b3J5KCdTb2NrZXQnLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICghd2luZG93LmlvKSB0aHJvdyBuZXcgRXJyb3IoJ3NvY2tldC5pbyBub3QgZm91bmQhJyk7XG4gICAgICAgIHJldHVybiB3aW5kb3cuaW8od2luZG93LmxvY2F0aW9uLm9yaWdpbik7XG4gICAgfSk7XG5cbiAgICAvLyBBVVRIX0VWRU5UUyBpcyB1c2VkIHRocm91Z2hvdXQgb3VyIGFwcCB0b1xuICAgIC8vIGJyb2FkY2FzdCBhbmQgbGlzdGVuIGZyb20gYW5kIHRvIHRoZSAkcm9vdFNjb3BlXG4gICAgLy8gZm9yIGltcG9ydGFudCBldmVudHMgYWJvdXQgYXV0aGVudGljYXRpb24gZmxvdy5cbiAgICBhcHAuY29uc3RhbnQoJ0FVVEhfRVZFTlRTJywge1xuICAgICAgICBsb2dpblN1Y2Nlc3M6ICdhdXRoLWxvZ2luLXN1Y2Nlc3MnLFxuICAgICAgICBsb2dpbkZhaWxlZDogJ2F1dGgtbG9naW4tZmFpbGVkJyxcbiAgICAgICAgbG9nb3V0U3VjY2VzczogJ2F1dGgtbG9nb3V0LXN1Y2Nlc3MnLFxuICAgICAgICBzZXNzaW9uVGltZW91dDogJ2F1dGgtc2Vzc2lvbi10aW1lb3V0JyxcbiAgICAgICAgbm90QXV0aGVudGljYXRlZDogJ2F1dGgtbm90LWF1dGhlbnRpY2F0ZWQnLFxuICAgICAgICBub3RBdXRob3JpemVkOiAnYXV0aC1ub3QtYXV0aG9yaXplZCdcbiAgICB9KTtcblxuICAgIGFwcC5mYWN0b3J5KCdBdXRoSW50ZXJjZXB0b3InLCBmdW5jdGlvbiAoJHJvb3RTY29wZSwgJHEsIEFVVEhfRVZFTlRTKSB7XG4gICAgICAgIHZhciBzdGF0dXNEaWN0ID0ge1xuICAgICAgICAgICAgNDAxOiBBVVRIX0VWRU5UUy5ub3RBdXRoZW50aWNhdGVkLFxuICAgICAgICAgICAgNDAzOiBBVVRIX0VWRU5UUy5ub3RBdXRob3JpemVkLFxuICAgICAgICAgICAgNDE5OiBBVVRIX0VWRU5UUy5zZXNzaW9uVGltZW91dCxcbiAgICAgICAgICAgIDQ0MDogQVVUSF9FVkVOVFMuc2Vzc2lvblRpbWVvdXRcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHJlc3BvbnNlRXJyb3I6IGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdChzdGF0dXNEaWN0W3Jlc3BvbnNlLnN0YXR1c10sIHJlc3BvbnNlKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gJHEucmVqZWN0KHJlc3BvbnNlKVxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgIH0pO1xuXG4gICAgYXBwLmNvbmZpZyhmdW5jdGlvbiAoJGh0dHBQcm92aWRlcikge1xuICAgICAgICAkaHR0cFByb3ZpZGVyLmludGVyY2VwdG9ycy5wdXNoKFtcbiAgICAgICAgICAgICckaW5qZWN0b3InLFxuICAgICAgICAgICAgZnVuY3Rpb24gKCRpbmplY3Rvcikge1xuICAgICAgICAgICAgICAgIHJldHVybiAkaW5qZWN0b3IuZ2V0KCdBdXRoSW50ZXJjZXB0b3InKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgXSk7XG4gICAgfSk7XG4gICAgYXBwLnNlcnZpY2UoJ0F1dGhTZXJ2aWNlJywgZnVuY3Rpb24gKCRodHRwLCBTZXNzaW9uLCAkcm9vdFNjb3BlLCBBVVRIX0VWRU5UUywgJHEpIHtcblxuICAgICAgICBmdW5jdGlvbiBvblN1Y2Nlc3NmdWxMb2dpbihyZXNwb25zZSkge1xuICAgICAgICAgICAgdmFyIGRhdGEgPSByZXNwb25zZS5kYXRhO1xuICAgICAgICAgICAgU2Vzc2lvbi5jcmVhdGUoZGF0YS5pZCwgZGF0YS51c2VyKTtcbiAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdChBVVRIX0VWRU5UUy5sb2dpblN1Y2Nlc3MpO1xuICAgICAgICAgICAgcmV0dXJuIGRhdGEudXNlcjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFVzZXMgdGhlIHNlc3Npb24gZmFjdG9yeSB0byBzZWUgaWYgYW5cbiAgICAgICAgLy8gYXV0aGVudGljYXRlZCB1c2VyIGlzIGN1cnJlbnRseSByZWdpc3RlcmVkLlxuICAgICAgICB0aGlzLmlzQXV0aGVudGljYXRlZCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiAhIVNlc3Npb24udXNlcjtcbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLmdldExvZ2dlZEluVXNlciA9IGZ1bmN0aW9uIChmcm9tU2VydmVyKSB7XG5cbiAgICAgICAgICAgIC8vIElmIGFuIGF1dGhlbnRpY2F0ZWQgc2Vzc2lvbiBleGlzdHMsIHdlXG4gICAgICAgICAgICAvLyByZXR1cm4gdGhlIHVzZXIgYXR0YWNoZWQgdG8gdGhhdCBzZXNzaW9uXG4gICAgICAgICAgICAvLyB3aXRoIGEgcHJvbWlzZS4gVGhpcyBlbnN1cmVzIHRoYXQgd2UgY2FuXG4gICAgICAgICAgICAvLyBhbHdheXMgaW50ZXJmYWNlIHdpdGggdGhpcyBtZXRob2QgYXN5bmNocm9ub3VzbHkuXG5cbiAgICAgICAgICAgIC8vIE9wdGlvbmFsbHksIGlmIHRydWUgaXMgZ2l2ZW4gYXMgdGhlIGZyb21TZXJ2ZXIgcGFyYW1ldGVyLFxuICAgICAgICAgICAgLy8gdGhlbiB0aGlzIGNhY2hlZCB2YWx1ZSB3aWxsIG5vdCBiZSB1c2VkLlxuXG4gICAgICAgICAgICBpZiAodGhpcy5pc0F1dGhlbnRpY2F0ZWQoKSAmJiBmcm9tU2VydmVyICE9PSB0cnVlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICRxLndoZW4oU2Vzc2lvbi51c2VyKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gTWFrZSByZXF1ZXN0IEdFVCAvc2Vzc2lvbi5cbiAgICAgICAgICAgIC8vIElmIGl0IHJldHVybnMgYSB1c2VyLCBjYWxsIG9uU3VjY2Vzc2Z1bExvZ2luIHdpdGggdGhlIHJlc3BvbnNlLlxuICAgICAgICAgICAgLy8gSWYgaXQgcmV0dXJucyBhIDQwMSByZXNwb25zZSwgd2UgY2F0Y2ggaXQgYW5kIGluc3RlYWQgcmVzb2x2ZSB0byBudWxsLlxuICAgICAgICAgICAgcmV0dXJuICRodHRwLmdldCgnL3Nlc3Npb24nKS50aGVuKG9uU3VjY2Vzc2Z1bExvZ2luKS5jYXRjaChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMubG9naW4gPSBmdW5jdGlvbiAoY3JlZGVudGlhbHMpIHtcbiAgICAgICAgICAgIHJldHVybiAkaHR0cC5wb3N0KCcvbG9naW4nLCBjcmVkZW50aWFscylcbiAgICAgICAgICAgICAgICAudGhlbihvblN1Y2Nlc3NmdWxMb2dpbilcbiAgICAgICAgICAgICAgICAuY2F0Y2goZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gJHEucmVqZWN0KHsgbWVzc2FnZTogJ0ludmFsaWQgbG9naW4gY3JlZGVudGlhbHMuJyB9KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgfTtcbiAgICAgICAgXG5cbiAgICAgICAgdGhpcy5zaWdudXAgPSBmdW5jdGlvbiAoY3JlZGVudGlhbHMpIHtcbiAgICAgICAgICAgIC8vc2VuZHMgYSBwb3N0IHJlcXVlc3QgY29udGFpbmluZyB0aGUgdXNlcidzIGNyZWRlbnRpYWxzIHRvIFxuICAgICAgICAgICAgcmV0dXJuICRodHRwLnBvc3QoJ2FwaS91c2Vycy9zaWdudXAnLCBjcmVkZW50aWFscylcbiAgICAgICAgICAgICAgICAvL29uY2UgdGhlIHVzZXIgaGFzIGJlZW4gY3JlYXRlZCBvbiB0aGUgYmFja2VuZC4uLlxuICAgICAgICAgICAgICAgIC50aGVuKGZ1bmN0aW9uKHJlc3BvbnNlKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vYSBzZWNvbmQgcG9zdCByZXF1ZXN0IGlzIGNyZWF0ZWQgdG8gbG9nIHRoZSB1c2VyIGluXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAkaHR0cC5wb3N0KCcvbG9naW4nLCBjcmVkZW50aWFscyk7XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAudGhlbihvblN1Y2Nlc3NmdWxMb2dpbilcbiAgICAgICAgICAgICAgICAuY2F0Y2goZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gJHEucmVqZWN0KHsgbWVzc2FnZTogJ0ludmFsaWQgc2lnbnVwIGNyZWRlbnRpYWxzLicgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5sb2dvdXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gJGh0dHAuZ2V0KCcvbG9nb3V0JykudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgU2Vzc2lvbi5kZXN0cm95KCk7XG4gICAgICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KEFVVEhfRVZFTlRTLmxvZ291dFN1Y2Nlc3MpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG5cbiAgICB9KTtcblxuICAgIGFwcC5zZXJ2aWNlKCdTZXNzaW9uJywgZnVuY3Rpb24gKCRyb290U2NvcGUsIEFVVEhfRVZFTlRTKSB7XG5cbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgICAgICRyb290U2NvcGUuJG9uKEFVVEhfRVZFTlRTLm5vdEF1dGhlbnRpY2F0ZWQsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHNlbGYuZGVzdHJveSgpO1xuICAgICAgICB9KTtcblxuICAgICAgICAkcm9vdFNjb3BlLiRvbihBVVRIX0VWRU5UUy5zZXNzaW9uVGltZW91dCwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgc2VsZi5kZXN0cm95KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuaWQgPSBudWxsO1xuICAgICAgICB0aGlzLnVzZXIgPSBudWxsO1xuXG4gICAgICAgIHRoaXMuY3JlYXRlID0gZnVuY3Rpb24gKHNlc3Npb25JZCwgdXNlcikge1xuICAgICAgICAgICAgdGhpcy5pZCA9IHNlc3Npb25JZDtcbiAgICAgICAgICAgIHRoaXMudXNlciA9IHVzZXI7XG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5kZXN0cm95ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5pZCA9IG51bGw7XG4gICAgICAgICAgICB0aGlzLnVzZXIgPSBudWxsO1xuICAgICAgICB9O1xuXG4gICAgfSk7XG5cbn0pKCk7XG4iLCJhcHAuY29uZmlnKGZ1bmN0aW9uICgkc3RhdGVQcm92aWRlcikge1xuXG4gICAgJHN0YXRlUHJvdmlkZXIuc3RhdGUoJ2hvbWUnLCB7XG4gICAgICAgIHVybDogJy8nLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2hvbWUvaG9tZS5odG1sJyxcbiAgICAgICAgY29udHJvbGxlcjogJ0hvbWVDdHJsJyxcbiAgICAgICAgcmVzb2x2ZToge1xuICAgICAgICAgICAgcmVxdWVzdGVkVXNlcjogZnVuY3Rpb24oQXV0aFNlcnZpY2UpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gQXV0aFNlcnZpY2UuZ2V0TG9nZ2VkSW5Vc2VyKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9KTtcblxufSk7XG5cbmFwcC5jb250cm9sbGVyKCdIb21lQ3RybCcsIGZ1bmN0aW9uICgkc2NvcGUsIEF1dGhTZXJ2aWNlLCAkc3RhdGUsIHJlcXVlc3RlZFVzZXIpIHtcbiAgICAvLyBJZiB0aGVyZSdzIGEgbG9nZ2VkIGluIHVzZXIgdXBvbiBsb2FkLCBnbyB0byB0aGUgZGFzaGJvYXJkXG4gICAgaWYgKHJlcXVlc3RlZFVzZXIpICRzdGF0ZS5nbygnZGFzaGJvYXJkJywge3VzZXJJZDogcmVxdWVzdGVkVXNlci5faWR9KTtcblxuICAgICRzY29wZS5ob21lID0gdHJ1ZTsgLy8gVG8ga25vdyB3aGF0IG5hdiBsaW5rcyB0byBzaG93XG4gICAgJHNjb3BlLmxvZ2luID0ge307XG4gICAgJHNjb3BlLnNpZ251cCA9IHt9O1xuICAgICRzY29wZS5sb2dpbkVycm9yID0gbnVsbDtcbiAgICAkc2NvcGUuc2lnbnVwRXJyb3IgPSBudWxsO1xuXG4gICAgJHNjb3BlLnNlbmRMb2dpbiA9IGZ1bmN0aW9uIChsb2dpbkluZm8pIHtcbiAgICAgICAgJHNjb3BlLmVycm9yID0gbnVsbDtcblxuICAgICAgICBBdXRoU2VydmljZS5sb2dpbihsb2dpbkluZm8pLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgICAgICRzdGF0ZS5nbygnZGFzaGJvYXJkJywge3VzZXJJZDogdXNlci5faWR9KTtcbiAgICAgICAgfSkuY2F0Y2goZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgJHNjb3BlLmxvZ2luRXJyb3IgPSBcIkkgdGhpbmsgeW91XFwndmUgZW50ZXJlZCB0aGUgd3JvbmcgaW5mbywgZnJpZW5kXCI7XG4gICAgICAgIH0pO1xuXG4gICAgfTtcblxuICAgICRzY29wZS5zZW5kU2lnbnVwID0gZnVuY3Rpb24oc2lnbnVwSW5mbykge1xuICAgICAgICAkc2NvcGUuZXJyb3IgPSBudWxsO1xuICAgICAgICBBdXRoU2VydmljZS5zaWdudXAoc2lnbnVwSW5mbykudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgICAgICAgJHN0YXRlLmdvKCdkYXNoYm9hcmQnLCB7dXNlcklkOiB1c2VyLl9pZH0sIHtyZWxvYWQ6IHRydWV9KTtcbiAgICAgICAgfSkuY2F0Y2goZnVuY3Rpb24oKXtcbiAgICAgICAgICAgICRzY29wZS5zaWdudXBFcnJvciA9IFwiSSdtIGFmcmFpZCB3ZSBhbHJlYWR5IGhhdmUgc29tZW9uZSBieSB0aGF0IG5hbWVcIjtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIC8vIFBhcmFsYXggZWZmZWN0IGZvciBpbWFnZXNcbiAgICAkKGZ1bmN0aW9uKCkge1xuICAgIC8vIENhY2hlIHRoZSB3aW5kb3cgb2JqZWN0IChtYWtlcyBsb2FkIHRpbWUgZmFzdGVyKVxuICAgIHZhciAkd2luZG93ID0gJCh3aW5kb3cpO1xuICAgIC8vIFBhcmFsbGF4IGJhY2tncm91bmQgZWZmZWN0XG4gICAgJCgnc2VjdGlvbltkYXRhLXR5cGU9XCJiYWNrZ3JvdW5kXCJdJykuZWFjaChmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyICRiZ29iaiA9ICQodGhpcyk7IC8vIGFzc2lnbmluZyB0aGUgb2JqZWN0XG4gICAgICAgICQod2luZG93KS5zY3JvbGwoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAvL3Njcm9sbCB0aGUgYmFja2dyb3VuZCBhdCB2YXIgc3BlZWRcbiAgICAgICAgICAgIC8vIHRoZSB5UG9zIGlzIGEgbmVnYXRpdmUgYmVjYXVzZSB3ZSdyZSBzY3JvbGxpbmcgaXQgdXBcbiAgICAgICAgICAgIHZhciB5UG9zID0gLSgkd2luZG93LnNjcm9sbFRvcCgpIC8gJGJnb2JqLmRhdGEoJ3NwZWVkJykpO1xuICAgICAgICAgICAgLy8gUHV0IHRvZ2V0aGVyIG91ciBmaW5hbCBiYWNrZ3JvdW5kIHBvc2l0aW9uXG4gICAgICAgICAgICB2YXIgY29vcmRzID0gJzUwJSAnICsgeVBvcyArICdweCc7XG4gICAgICAgICAgICAvLyBNb3ZlIHRoZSBiYWNrZ3JvdW5kXG4gICAgICAgICAgICAkYmdvYmouY3NzKHsgYmFja2dyb3VuZFBvc2l0aW9uOiBjb29yZHMgfSk7XG4gICAgICAgIH0pOyAvLyBlbmQgd2luZG93IHNjcm9sbFxuICAgIH0pO1xufSk7XG5cblxuXG59KTsiLCJhcHAuY29uZmlnKGZ1bmN0aW9uICgkc3RhdGVQcm92aWRlcil7XG5cdCRzdGF0ZVByb3ZpZGVyLnN0YXRlKCdlZGl0b3InLFxuXHRcdHtcblx0XHRcdHVybDogJy9lZGl0b3IvOmlkJyxcblx0XHRcdHRlbXBsYXRlVXJsOiAnanMvcXVlc3QtZWRpdG9yL2VkaXRvci5odG1sJyxcblx0XHRcdGNvbnRyb2xsZXI6ICdFZGl0b3JDdHJsJyxcblx0XHQgICAgcmVzb2x2ZToge1xuXHRcdCAgICBcdHF1ZXN0OiBmdW5jdGlvbihRdWVzdEZhY3RvcnksICRzdGF0ZVBhcmFtcyl7XG5cdFx0ICAgIFx0XHRyZXR1cm4gJHN0YXRlUGFyYW1zLmlkICE9PSBcIlwiID9cblx0XHRcdFx0XHRcdFF1ZXN0RmFjdG9yeS5nZXRPbmVRdWVzdCgkc3RhdGVQYXJhbXMuaWQpIDogXG5cdFx0XHRcdFx0XHR1bmRlZmluZWQ7XG5cdFx0ICAgIFx0fVxuXHRcdCAgICB9LFxuXHRcdFx0ZGF0YToge1xuXHQgICAgICAgIGF1dGhlbnRpY2F0ZTogdHJ1ZVxuXHQgICAgfVxuXHR9KTtcbn0pO1xuXG5hcHAuY29udHJvbGxlcignRWRpdG9yQ3RybCcsIGZ1bmN0aW9uICgkc2NvcGUsICRzdGF0ZVBhcmFtcywgJHVpYk1vZGFsLCAkc3RhdGUsICRyb290U2NvcGUsIHF1ZXN0LCBTZXNzaW9uLCBRdWVzdEZhY3RvcnksIEF1dGhTZXJ2aWNlKSB7XG5cdC8vdmFyaWFibGUgc2F2ZWQgdG8gc2hvdy9oaWRlIHF1ZXN0IGVkaXRvciB3aGVuIGVkaXRpbmcgaW5kaXZpZHVhbCBzdGF0ZXNcblx0JHJvb3RTY29wZS5lZGl0b3JWaXNpYmxlID0gdHJ1ZTtcblx0JHNjb3BlLnF1ZXN0ID0gcXVlc3Q7XG5cdCRzY29wZS52aWV3TWFpbk1hcCA9IHRydWU7XG5cdCRzY29wZS5uZXdRdWVzdCA9IGZhbHNlO1xuXHQvL2lmIHRoZXJlIGlzIG5vIG5ldyBxdWVzdCwgc2V0IHByb3BlcnRpZXMgXG5cdGlmKCFxdWVzdCkge1xuXHRcdCRzY29wZS5uZXdRdWVzdCA9IHRydWU7XG5cdFx0JHNjb3BlLnF1ZXN0PSB7XG5cdFx0XHRzdGFydDogIFs0MC43MjMwMDgsLTc0LjAwMDYzMjddXG5cdFx0fTtcblx0fVxuXG5cdC8vdXBkYXRlIHF1ZXN0IGFuZCBnbyB0byBkYXNoYm9hcmQgZm9yIGN1cnJlbnQgdXNlclxuXHQkc2NvcGUuc2F2ZVF1ZXN0ID0gZnVuY3Rpb24gKCkge1xuXHRcdC8vIGZpbHRlciBvdXQgYWxsIHF1ZXN0U3RlcHMgd2l0aG91dCB0YXJnZXRDaXJsY2xlcyBvciB0cmFuc2l0aW9uSW5mby50aXRsZVxuXHRcdHF1ZXN0LnF1ZXN0U3RlcHMgPSBxdWVzdC5xdWVzdFN0ZXBzLmZpbHRlcihmdW5jdGlvbihzdGVwKSB7XG5cdFx0XHRyZXR1cm4gKHN0ZXAudGFyZ2V0Q2lyY2xlLmNlbnRlci5sZW5ndGggJiYgc3RlcC50cmFuc2l0aW9uSW5mby50aXRsZSk7XG5cdFx0fSk7XG5cblx0XHRpZighJHNjb3BlLm5ld1F1ZXN0KSB7XG5cdFx0XHRyZXR1cm4gUXVlc3RGYWN0b3J5LnNhdmUoJHNjb3BlLnF1ZXN0KVx0XHRcblx0XHRcdC50aGVuKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0JHN0YXRlLmdvKCdkYXNoYm9hcmQnLCB7dXNlcklkOiBTZXNzaW9uLnVzZXIuX2lkfSk7XG5cdFx0XHR9KVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gUXVlc3RGYWN0b3J5LnNhdmVOZXcoJHNjb3BlLnF1ZXN0KVxuXHRcdFx0LnRoZW4oZnVuY3Rpb24gKCkge1xuXHRcdFx0XHQkc3RhdGUuZ28oJ2Rhc2hib2FyZCcsIHt1c2VySWQ6IFNlc3Npb24udXNlci5faWR9KTtcblx0XHRcdH0pXG5cdFx0fVxuXHR9O1xuXHQvL2dvIHRvIG1hcFN0YXRlcyBlZGl0b3IgYW5kIGhpZGUgUXVlc3QgZWRpdG9yIFxuXHQkc2NvcGUudHJhbnNpdGlvblRvTWFwU3RhdGVFZGl0b3IgPSBmdW5jdGlvbiAoKSB7XG5cdFx0aWYoISRzY29wZS5uZXdRdWVzdCkge1xuXHRcdFx0cmV0dXJuIFF1ZXN0RmFjdG9yeS5zYXZlKCRzY29wZS5xdWVzdClcblx0XHRcdC50aGVuKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0aWYoJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0JHN0YXRlLmdvKCdlZGl0b3IucXVlc3RTdGVwJywge3F1ZXN0U3RlcElkOiBudWxsfSk7XG5cdFx0XHRcdH0gZWxzZSB7IFxuXHRcdFx0XHRcdCRzdGF0ZS5nbygnZWRpdG9yLnF1ZXN0U3RlcCcsIHtxdWVzdFN0ZXBJZDogJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHNbMF0uX2lkfSk7XHRcblx0XHRcdFx0fVxuXHRcdFx0XHQkc2NvcGUuZWRpdG9yVmlzaWJsZSA9IGZhbHNlO1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBRdWVzdEZhY3Rvcnkuc2F2ZU5ldygkc2NvcGUucXVlc3QpXG5cdFx0XHQudGhlbihmdW5jdGlvbiAoc2F2ZWRRdWVzdCkge1xuXHRcdFx0XHQkc2NvcGUuZWRpdG9yVmlzaWJsZSA9IGZhbHNlO1xuXHRcdFx0XHQkc3RhdGUuZ28oJ2VkaXRvci5xdWVzdFN0ZXAnLCB7aWQ6IHNhdmVkUXVlc3QuX2lkLCBxdWVzdFN0ZXBJZDogbnVsbH0pO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9O1xuXG5cdCRzY29wZS5sb2dvdXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIEF1dGhTZXJ2aWNlLmxvZ291dCgpLnRoZW4oZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAkc3RhdGUuZ28oJ2hvbWUnKTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuXHQvLyoqKioqKioqKioqICBNQVAgRlVOQ1RJT05TIEJFTE9XICAqKioqKioqKioqKioqKioqKioqKioqKlxuXHR2YXIgdXNlckxvY2F0aW9uO1xuXHR2YXIgdGFyZ2V0Q2lyY2xlcyA9IFtdO1xuXHR2YXIgY2lyY2xlQ2VudGVycyA9IFtdO1xuXHR2YXIgcXVlc3RNYXAgPSBMLm1hcCgncXVlc3QtbWFwJykuc2V0VmlldyhbNDAuNzIzMDA4LC03NC4wMDA2MzI3XSwgMTMpO1xuXHRxdWVzdE1hcC5zY3JvbGxXaGVlbFpvb20uZGlzYWJsZSgpOyAvLyBSZWFsbHkgYW5ub3lpbmcgd2hlbiBpdCBoYXBwZW5zIGFjY2lkZW50bHlcblx0TC50aWxlTGF5ZXIoJ2h0dHBzOi8vYXBpLnRpbGVzLm1hcGJveC5jb20vdjQve2lkfS97en0ve3h9L3t5fS5wbmc/YWNjZXNzX3Rva2VuPXthY2Nlc3NUb2tlbn0nLCB7XG4gICAgbWF4Wm9vbTogMTgsXG4gICAgaWQ6ICdzY290dGVnZ3Mubzc2MTRqbDInLFxuICAgIGFjY2Vzc1Rva2VuOiAncGsuZXlKMUlqb2ljMk52ZEhSbFoyZHpJaXdpWVNJNkltTnBhRFpvWnpobWRqQmpNRFoxY1dvNWFHY3lhWGx0ZVRraWZRLkxaZTAtSUJSUW1aMFBrUUJzWUlsaXcnXG5cdH0pLmFkZFRvKHF1ZXN0TWFwKTtcblxuXHQvLyBJZiB0aGVyZSBhcmUgbm8gdGFyZ2V0Q2lyY2xlcyB5ZXQgY3JlYXRlZCwgc2V0IG1hcCB2aWV3IHRvIHVzZXIncyBsb2NhdGlvblxuXHRpZiAoISRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzWzBdIHx8ICEkc2NvcGUucXVlc3QucXVlc3RTdGVwc1swXS50YXJnZXRDaXJjbGUpIHtcblxuXHRcdHF1ZXN0TWFwLmxvY2F0ZSgpLm9uKCdsb2NhdGlvbmZvdW5kJywgZnVuY3Rpb24gKGUpIHtcblx0XHRcdHVzZXJMb2NhdGlvbiA9IFtlLmxhdGl0dWRlLGUubG9uZ2l0dWRlXTtcblx0XHRcdHF1ZXN0TWFwLnNldFZpZXcodXNlckxvY2F0aW9uLCAxNCk7XG5cdFx0fSk7XG5cdH1cblxuXHQvLyBSZWRyYXcgYWxsIHRhcmdldENpcmNsZXMgZm9yIHRoZSBxdWVzdCBvbiB0aGUgbWFwIGFuZCByZXNldCB0aGUgYm91bmRzXG5cdGZ1bmN0aW9uIGRyYXdDaXJjbGVzKCkge1xuXHRcdC8vIFJlbW92ZSBhbGwgY2lyY2xlc1xuXHRcdHRhcmdldENpcmNsZXMuZm9yRWFjaChmdW5jdGlvbihjaXJjbGUpIHtcblx0XHRcdHF1ZXN0TWFwLnJlbW92ZUxheWVyKGNpcmNsZSk7XG5cdFx0fSk7XG5cdFx0Ly8gRHJhdyBhIGNpcmNsZSBmb3IgZXZlcnkgdGFyZ2V0Q2lyY2xlIGluIHRoZSBxdWVzdFxuXHRcdGlmICgkc2NvcGUucXVlc3QucXVlc3RTdGVwcy5sZW5ndGgpIHtcblx0XHRcdCRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzLmZvckVhY2goZnVuY3Rpb24oc3RlcCwgaW5kZXgpIHtcblx0XHRcdFx0aWYgKHN0ZXAudGFyZ2V0Q2lyY2xlICYmIHN0ZXAudGFyZ2V0Q2lyY2xlLmNlbnRlci5sZW5ndGgpIHtcblx0XHRcdFx0XHR2YXIgY2VudGVyID0gc3RlcC50YXJnZXRDaXJjbGUuY2VudGVyO1xuXHRcdFx0XHRcdHZhciByYWRpdXMgPSBzdGVwLnRhcmdldENpcmNsZS5yYWRpdXM7XG5cdFx0XHRcdFx0dmFyIGNpcmNsZSA9IEwuY2lyY2xlKGNlbnRlcixyYWRpdXMpO1xuXHRcdFx0XHRcdGNpcmNsZS5iaW5kTGFiZWwoKGluZGV4KzEpLnRvU3RyaW5nKCksIHsgbm9IaWRlOiB0cnVlIH0pLmFkZFRvKHF1ZXN0TWFwKTtcblx0XHRcdFx0XHR0YXJnZXRDaXJjbGVzLnB1c2goY2lyY2xlKTtcblx0XHRcdFx0XHRjaXJjbGVDZW50ZXJzLnB1c2goc3RlcC50YXJnZXRDaXJjbGUuY2VudGVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRxdWVzdE1hcC5maXRCb3VuZHMoY2lyY2xlQ2VudGVycyk7XG5cdFx0fVxuXHR9XG5cdGRyYXdDaXJjbGVzKCk7XG5cbn0pO1xuXG4iLCJhcHAuY29uZmlnKGZ1bmN0aW9uICgkc3RhdGVQcm92aWRlcikge1xuJHN0YXRlUHJvdmlkZXIuc3RhdGUoJ2VkaXRvci5xdWVzdFN0ZXAnLCB7XG5cdFx0dXJsOiAnL3F1ZXN0c3RlcC86cXVlc3RTdGVwSWQnLCBcblx0XHR0ZW1wbGF0ZVVybDogJ2pzL3F1ZXN0LXN0ZXAtZWRpdG9yL3F1ZXN0LXN0ZXAtZWRpdG9yLmh0bWwnLFxuXHRcdGNvbnRyb2xsZXI6ICdRdWVzdFN0ZXBFZGl0Q3RybCcsXG5cdFx0cmVzb2x2ZToge1xuXHRcdFx0cXVlc3Q6IGZ1bmN0aW9uKFF1ZXN0RmFjdG9yeSwgJHN0YXRlUGFyYW1zKXtcbiAgICBcdFx0cmV0dXJuICRzdGF0ZVBhcmFtcy5pZCAhPT0gXCJcIiA/XG5cdFx0XHRcdFx0UXVlc3RGYWN0b3J5LmdldE9uZVF1ZXN0KCRzdGF0ZVBhcmFtcy5pZCkgOiBcblx0XHRcdFx0XHR1bmRlZmluZWQ7XG4gICAgXHRcdH1cblx0XHR9LFxuXHRcdGRhdGE6IHtcbiAgICAgIFx0XHRhdXRoZW50aWNhdGU6IHRydWVcbiAgICBcdH1cblx0fSk7XG59KTtcblxuXG5hcHAuY29udHJvbGxlcignUXVlc3RTdGVwRWRpdEN0cmwnLCBmdW5jdGlvbiAoJHN0YXRlUGFyYW1zLCAkc2NvcGUsICRzdGF0ZSwgJHJvb3RTY29wZSwgcXVlc3QsIFF1ZXN0RmFjdG9yeSl7XG5cdCRzY29wZS5xdWVzdCA9IHF1ZXN0O1xuXHQkcm9vdFNjb3BlLmVkaXRvclZpc2libGUgPSBmYWxzZTtcblx0JHNjb3BlLnZpZXdNYXAgPSB0cnVlO1xuXHR2YXIgdXNlckxvY2F0aW9uO1xuXHQkc2NvcGUudGFyZ2V0RXJyb3IgPSBmYWxzZTtcblx0JHNjb3BlLnRpdGxlRXJyb3IgPSBmYWxzZTtcblxuXHQvL2RlZmluZCBuZXcgU3RlcCBmb3IgYWRkaW5nIHRvIHN0ZXBzIGFycmF5XG5cdCRzY29wZS5uZXdTdGVwID0ge1xuXHRcdG5hbWU6ICdOZXcgU3RlcCcsXG5cdFx0dGFyZ2V0Q2lyY2xlOiB7XG5cdFx0XHRcdGNlbnRlcjogW10sXG5cdFx0XHRcdHJhZGl1czogbnVsbFxuXHRcdFx0fVxuXHRcdH07XG5cdC8vIGlmIHdlIGhhdmUgc3RlcHMsIGZpbmQgdGhlIGluZGV4IG9mIHRoZSBzdGVwIHRoYXQgbWF0Y2hlcyB0aGUgcGFyYW1zXG5cdGlmKCRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzLmxlbmd0aCA+IDApIHtcblx0XHQkc2NvcGUucXVlc3QucXVlc3RTdGVwcy5mb3JFYWNoKCBmdW5jdGlvbiAoc3RlcCwgaW5kZXgpIHtcblx0XHRcdGlmIChzdGVwLl9pZCA9PT0gJHN0YXRlUGFyYW1zLnF1ZXN0U3RlcElkKSB7XG5cdFx0XHRcdCRzY29wZS5xdWVzdC5pZHggPSBpbmRleDtcblx0XHRcdH1cblx0XHR9KTtcblx0XHQvL3NldHMgY3VycmVudFN0ZXAgdG8gdGhhdCBtYXRjaGluZyB0aGUgcGFyYW1ldGVyc1xuXHRcdCRzY29wZS5jdXJyZW50U3RlcCA9ICRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzWyRzY29wZS5xdWVzdC5pZHhdO1xuXHR9IGVsc2Uge1xuXHRcdCRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzLnB1c2goJHNjb3BlLm5ld1N0ZXApO1xuXHRcdCRzY29wZS5jdXJyZW50U3RlcCA9ICRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzWzBdO1xuXHR9XG5cdC8vZnVuY3Rpb24gdG8gc3dpdGNoIHN0YXRlcyB3aXRoaW4gbWFwU3RhdGUgZWRpdG9yXG5cdCRzY29wZS5zd2l0Y2hTdGVwID0gZnVuY3Rpb24gKGNsaWNrZWRTdGVwKSB7XG5cdFx0aWYgKCRzY29wZS5jdXJyZW50U3RlcC50YXJnZXRDaXJjbGUuY2VudGVyLmxlbmd0aCAmJiAkc2NvcGUuY3VycmVudFN0ZXAudHJhbnNpdGlvbkluZm8gJiYgJHNjb3BlLmN1cnJlbnRTdGVwLnRyYW5zaXRpb25JbmZvLnRpdGxlKSB7XG5cdFx0XHRRdWVzdEZhY3Rvcnkuc2F2ZSgkc2NvcGUucXVlc3QpXG5cdFx0XHQudGhlbihmdW5jdGlvbiAoKSB7XG5cdFx0XHQvLyByZWRpcmVjdCB0byB0aGUgY2xpY2tlZCBtYXBzdGF0ZVxuXHRcdFx0XHQkc3RhdGUuZ28oJ2VkaXRvci5xdWVzdFN0ZXAnLCB7cXVlc3RTdGVwSWQ6IGNsaWNrZWRTdGVwLl9pZH0pO1x0XG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKCEkc2NvcGUuY3VycmVudFN0ZXAudGFyZ2V0Q2lyY2xlLmNlbnRlci5sZW5ndGgpIGZsYXNoRXJyb3IoJ3RhcmdldEVycm9yJyk7XG5cdFx0XHRpZiAoISRzY29wZS5jdXJyZW50U3RlcC50cmFuc2l0aW9uSW5mbyB8fCAhJHNjb3BlLmN1cnJlbnRTdGVwLnRyYW5zaXRpb25JbmZvLnRpdGxlKSBmbGFzaEVycm9yKCd0aXRsZUVycm9yJyk7XG5cdFx0fVxuXHR9O1xuXHQkc2NvcGUuc2F2ZVF1ZXN0U3RlcHMgPSBmdW5jdGlvbiAoKSB7XG5cdFx0aWYgKCRzY29wZS5jdXJyZW50U3RlcC50YXJnZXRDaXJjbGUuY2VudGVyLmxlbmd0aCkge1xuXHRcdFx0Ly91cGRhdGUgcXVlc3Rcblx0XHRcdFF1ZXN0RmFjdG9yeS5zYXZlKCRzY29wZS5xdWVzdClcblx0XHRcdC50aGVuKGZ1bmN0aW9uICh1cGRhdGVkUXVlc3QpIHtcblx0XHRcdFx0JHNjb3BlLnF1ZXN0ID0gdXBkYXRlZFF1ZXN0O1xuXHRcdFx0XHQkc3RhdGUuZ28oJ2VkaXRvcicsIHtpZDogJHNjb3BlLnF1ZXN0Ll9pZH0sIHtyZWxvYWQ6IHRydWV9KTtcdFxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIGZsYXNoRXJyb3IoJ3RhcmdldEVycm9yJyk7XG5cdH07XG5cdCRzY29wZS5hZGRRdWVzdFN0ZXAgPSBmdW5jdGlvbiAoKSB7XG5cdFx0JHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMucHVzaCgkc2NvcGUubmV3U3RlcCk7XG5cdFx0cmV0dXJuIFF1ZXN0RmFjdG9yeS5zYXZlKCRzY29wZS5xdWVzdClcblx0XHQudGhlbiggZnVuY3Rpb24gKHVwZGF0ZWRRdWVzdCkge1xuXHRcdFx0JHNjb3BlLnF1ZXN0ID0gdXBkYXRlZFF1ZXN0O1xuXHRcdFx0JHN0YXRlLmdvKCdlZGl0b3IucXVlc3RTdGVwJywge3F1ZXN0U3RlcElkOiAkc2NvcGUucXVlc3QucXVlc3RTdGVwc1skc2NvcGUucXVlc3QucXVlc3RTdGVwcy5sZW5ndGgtMV0uX2lkfSk7XG5cdFx0fSk7XG5cblx0fTtcblx0JHNjb3BlLnJlbW92ZVF1ZXN0U3RlcCA9IGZ1bmN0aW9uICgpIHtcblx0XHR2YXIgaW5kZXggPSAkc2NvcGUucXVlc3QucXVlc3RTdGVwcy5pbmRleE9mKCRzY29wZS5jdXJyZW50U3RlcCk7XG5cdFx0JHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHRpZiAoaW5kZXggPT09ICRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzLmxlbmd0aCkgaW5kZXgtLTtcblx0XHRyZXR1cm4gUXVlc3RGYWN0b3J5LnNhdmUoJHNjb3BlLnF1ZXN0KVxuXHRcdC50aGVuKCBmdW5jdGlvbiAodXBkYXRlZFF1ZXN0KSB7XG5cdFx0XHQkc2NvcGUucXVlc3QgPSB1cGRhdGVkUXVlc3Q7XG5cdFx0XHR2YXIgc3RlcERlc3RpbmF0aW9uID0gJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMubGVuZ3RoPT09MCA/IG51bGwgOiAkc2NvcGUucXVlc3QucXVlc3RTdGVwc1tpbmRleF0uX2lkO1xuXHRcdFx0JHN0YXRlLmdvKCdlZGl0b3IucXVlc3RTdGVwJywge3F1ZXN0U3RlcElkOiBzdGVwRGVzdGluYXRpb259LCB7cmVsb2FkOiB0cnVlfSk7XG5cdFx0fSk7XG5cdH07XG5cblx0ZnVuY3Rpb24gZmxhc2hFcnJvcihlcnJvclR5cGUpIHtcblx0XHQkc2NvcGVbZXJyb3JUeXBlXSA9IHRydWU7XG5cdFx0c2V0VGltZW91dChmdW5jdGlvbigpIHtcblx0XHRcdCRzY29wZVtlcnJvclR5cGVdID0gZmFsc2U7IFxuXHRcdFx0JHNjb3BlLiRkaWdlc3QoKTtcblx0XHR9LCAzMDAwKTtcblx0fVxuXG5cblx0Ly8gTUFQIEJFTE9XID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09Pj5cblxuXHQvLyBpbml0aWFsaXplIG1hcFxuXHR2YXIgcXVlc3RTdGVwTWFwID0gTC5tYXAoJ3F1ZXN0LXN0ZXAtbWFwJyk7XG5cdHF1ZXN0U3RlcE1hcC5zY3JvbGxXaGVlbFpvb20uZGlzYWJsZSgpOyAvLyBSZWFsbHkgYW5ub3lpbmcgd2hlbiBpdCBoYXBwZW5zIGFjY2lkZW50bHlcblx0Ly9hZGQgcGlyYXRlIG1hcCB0aWxlc1xuXHRMLnRpbGVMYXllcignaHR0cHM6Ly9hcGkudGlsZXMubWFwYm94LmNvbS92NC97aWR9L3t6fS97eH0ve3l9LnBuZz9hY2Nlc3NfdG9rZW49e2FjY2Vzc1Rva2VufScsIHtcbiAgICBtYXhab29tOiAxOCxcbiAgICBpZDogJ3Njb3R0ZWdncy5vNzYxNGpsMicsXG4gICAgYWNjZXNzVG9rZW46ICdway5leUoxSWpvaWMyTnZkSFJsWjJkeklpd2lZU0k2SW1OcGFEWm9aemhtZGpCak1EWjFjV281YUdjeWFYbHRlVGtpZlEuTFplMC1JQlJRbVowUGtRQnNZSWxpdydcblx0fSkuYWRkVG8ocXVlc3RTdGVwTWFwKTtcblxuXHQvLyBTZXQgdmlldyB1c2luZyB0YXJnZXRDaXJjbGUgZm9yIHRoaXMgc3RlcCBpZiBkZWZpbmVkXG5cdC8vIFRoZW4gdHJ5IGZpcnN0IHRhcmdldENpcmNsZSBmb3IgcXVlc3QgaWYgZGVmaW5lZFxuXHQvLyBPdGhlcndpc2UgZ2V0IHVzZXIncyBsb2NhdGlvbiBhbmQgc2V0IG1hcCB2aWV3IHdpdGggdGhhdFxuXHRpZiAoJHNjb3BlLmN1cnJlbnRTdGVwLnRhcmdldENpcmNsZS5jZW50ZXIubGVuZ3RoID09PSAyKSB7XG5cdFx0cXVlc3RTdGVwTWFwLnNldFZpZXcoJHNjb3BlLmN1cnJlbnRTdGVwLnRhcmdldENpcmNsZS5jZW50ZXIsIDE1KTtcblx0fSBlbHNlIGlmICgkc2NvcGUucXVlc3QucXVlc3RTdGVwc1swXS50YXJnZXRDaXJjbGUuY2VudGVyLmxlbmd0aCA9PT0gMikge1xuXHRcdHF1ZXN0U3RlcE1hcC5zZXRWaWV3KCRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzWzBdLnRhcmdldENpcmNsZS5jZW50ZXIsIDE1KTtcblx0fSBlbHNlIHtcblx0XHRxdWVzdFN0ZXBNYXAubG9jYXRlKCkub24oJ2xvY2F0aW9uZm91bmQnLCBmdW5jdGlvbiAoZSkge1xuXHRcdFx0dXNlckxvY2F0aW9uID0gW2UubGF0aXR1ZGUsZS5sb25naXR1ZGVdO1xuXHRcdFx0cXVlc3RTdGVwTWFwLnNldFZpZXcodXNlckxvY2F0aW9uLCAxNSk7XG5cdFx0fSk7XG5cdH1cblxuXHQvLyBJbml0aWFsaXplIHRoZSBGZWF0dXJlR3JvdXAgdG8gc3RvcmUgZWRpdGFibGUgbGF5ZXJzXG5cdHZhciBkcmF3bkl0ZW1zID0gbmV3IEwuRmVhdHVyZUdyb3VwKCk7XG5cdHF1ZXN0U3RlcE1hcC5hZGRMYXllcihkcmF3bkl0ZW1zKTtcblxuXHQvLyBJbml0aWFsaXplIHRoZSBkcmF3IGNvbnRyb2wgYW5kIHBhc3MgaXQgdGhlIEZlYXR1cmVHcm91cCBvZiBlZGl0YWJsZSBsYXllcnNcblx0dmFyIGRyYXdDb250cm9sID0gbmV3IEwuQ29udHJvbC5EcmF3KHtcblx0ICAgIGRyYXc6IHtcblx0ICAgIFx0cG9seWxpbmU6IGZhbHNlLFxuXHQgICAgXHRwb2x5Z29uOiBmYWxzZSxcblx0ICAgIFx0cmVjdGFuZ2xlOiBmYWxzZSxcblx0ICAgIFx0bWFya2VyOiBmYWxzZVxuXHQgICAgfSxcblx0ICAgIGVkaXQ6IHtcblx0ICAgICAgICBmZWF0dXJlR3JvdXA6IGRyYXduSXRlbXNcblx0ICAgIH1cblx0fSk7XG5cdHF1ZXN0U3RlcE1hcC5hZGRDb250cm9sKGRyYXdDb250cm9sKTtcblx0Ly9pZiB0aGVyZSBpcyBhIHRhcmdldCByZWdpb24sIGRyYXcgaXQgb24gdGhlIG1hcFxuXHRpZiAoJHNjb3BlLmN1cnJlbnRTdGVwLnRhcmdldENpcmNsZS5jZW50ZXIubGVuZ3RoID09PSAyKSB7XG5cdFx0dmFyIGN1cnJlbnRSZWdpb24gPSBMLmNpcmNsZSgkc2NvcGUuY3VycmVudFN0ZXAudGFyZ2V0Q2lyY2xlLmNlbnRlciwkc2NvcGUuY3VycmVudFN0ZXAudGFyZ2V0Q2lyY2xlLnJhZGl1cyk7XG5cdFx0cXVlc3RTdGVwTWFwLmFkZExheWVyKGN1cnJlbnRSZWdpb24pO1xuXHR9XG5cdHZhciBjaXJjbGU7XG5cdHF1ZXN0U3RlcE1hcC5vbignZHJhdzpjcmVhdGVkJywgZnVuY3Rpb24gKGUpIHtcblx0Ly9yZW1vdmUgdGhlIGxvYWRlZCByZWdpb24gdGhlbiByZW1vdmUgYW55IG5ld2x5IGRyYXduIGNpcmNsZXNcbiAgXHRpZihjdXJyZW50UmVnaW9uKSBxdWVzdFN0ZXBNYXAucmVtb3ZlTGF5ZXIoY3VycmVudFJlZ2lvbik7XG4gIFx0aWYoY2lyY2xlKSBxdWVzdFN0ZXBNYXAucmVtb3ZlTGF5ZXIoY2lyY2xlKTtcbiAgXHR2YXIgdHlwZSA9IGUubGF5ZXJUeXBlO1xuICBcdHZhciBsYXllciA9IGUubGF5ZXI7XG4gIFx0Ly9hc3NpZ24gdGFyZ2V0IHJlZ2lvbiB0byBwcm9wZXJ0aWVzIG9mIGRyYXduIG9iamVjdFxuICAgICRzY29wZS5jdXJyZW50U3RlcC50YXJnZXRDaXJjbGUuY2VudGVyID0gW2xheWVyLl9sYXRsbmcubGF0LGxheWVyLl9sYXRsbmcubG5nXTtcbiAgICAkc2NvcGUuY3VycmVudFN0ZXAudGFyZ2V0Q2lyY2xlLnJhZGl1cyA9IGxheWVyLl9tUmFkaXVzO1xuICAgIC8vZGVjbGFyZSBuZXcgb2JqZWN0IGJhc2VkIG9uIHByb3BlcnRpZWQgZHJhd24gYW5kIGFkZCB0byBtYXBcbiAgICBjaXJjbGUgPSBMLmNpcmNsZShbbGF5ZXIuX2xhdGxuZy5sYXQsbGF5ZXIuX2xhdGxuZy5sbmddLCBsYXllci5fbVJhZGl1cyk7XG4gICAgcXVlc3RTdGVwTWFwLmFkZExheWVyKGNpcmNsZSk7XG5cdH0pO1xuXG5cdCRzY29wZS5nZXRNb2RhbEJ1dHRvblRleHQgPSBmdW5jdGlvbigpIHtcblx0XHRpZiAoJHNjb3BlLmN1cnJlbnRTdGVwICYmICRzY29wZS5jdXJyZW50U3RlcC50cmFuc2l0aW9uSW5mbyAmJiAkc2NvcGUuY3VycmVudFN0ZXAudHJhbnNpdGlvbkluZm8ucXVlc3Rpb24pIHJldHVybiBcIlN1Ym1pdCFcIjtcblx0XHRyZXR1cm4gXCJHb3QgaXQhXCI7XG5cdH07XG59KTtcblxuXG5cbiIsImFwcC5jb25maWcoZnVuY3Rpb24gKCRzdGF0ZVByb3ZpZGVyKXtcblx0JHN0YXRlUHJvdmlkZXIuc3RhdGUoJ2Rhc2hib2FyZCcse1xuXHRcdHVybDogJy9kYXNoYm9hcmQvOnVzZXJJZCcsXG5cdFx0dGVtcGxhdGVVcmw6ICdqcy91c2VyLWRhc2hib2FyZC9kYXNoYm9hcmQuaHRtbCcsXG5cdFx0Y29udHJvbGxlcjogJ0Rhc2hDdHJsJyxcblx0XHRyZXNvbHZlOiB7XG5cdFx0XHR1c2VyUXVlc3RzOiBmdW5jdGlvbihRdWVzdEZhY3RvcnksICRzdGF0ZVBhcmFtcyl7XG5cdFx0XHRcdHJldHVybiBRdWVzdEZhY3RvcnkuZ2V0VXNlclF1ZXN0cygkc3RhdGVQYXJhbXMudXNlcklkKTtcblx0XHRcdH1cblx0XHR9LFxuXHRcdGRhdGE6IHtcbiAgICAgICAgICAgIGF1dGhlbnRpY2F0ZTogdHJ1ZVxuICAgICAgICB9XG5cdH0pO1xufSk7XG5cbmFwcC5jb250cm9sbGVyKCdEYXNoQ3RybCcsIGZ1bmN0aW9uICgkc3RhdGUsICRzY29wZSwgdXNlclF1ZXN0cywgU2Vzc2lvbiwgUXVlc3RGYWN0b3J5KXtcblx0JHNjb3BlLmRhc2hib2FyZCA9IHRydWU7XG5cdCRzY29wZS5xdWVzdHMgPSBbXTtcblx0JHNjb3BlLnF1ZXN0cyA9IHVzZXJRdWVzdHMubWFwKGZ1bmN0aW9uKGcpIHsgXG5cdFx0Zy5zaG93RGV0YWlsID0gZmFsc2U7XG5cdFx0cmV0dXJuIGc7XG5cdH0pO1xuXG5cdCRzY29wZS5nb1RvRWRpdG9yID0gZnVuY3Rpb24gKHF1ZXN0Q2xpY2tlZCkge1xuXHRcdCRzdGF0ZS5nbygnZWRpdG9yJywge2lkOiBxdWVzdENsaWNrZWQuX2lkfSwge3JlbG9hZDogdHJ1ZX0pO1xuXHR9O1xuXHQkc2NvcGUuZGVsZXRlUXVlc3QgPSBmdW5jdGlvbiAocXVlc3RDbGlja2VkKSB7XG5cdFx0cmV0dXJuIFF1ZXN0RmFjdG9yeS5kZWxldGUocXVlc3RDbGlja2VkKVxuXHRcdC50aGVuKCBmdW5jdGlvbiAoZGVsZXRlZFF1ZXN0KSB7XG5cdFx0XHQkc3RhdGUuZ28oJ2Rhc2hib2FyZCcsIHt1c2VySWQ6IFNlc3Npb24udXNlci5faWR9LCB7cmVsb2FkOiB0cnVlfSk7XG5cdFx0fSk7XG5cdH07XG5cdCRzY29wZS5wYXJlbnRDbGljayA9IGZ1bmN0aW9uKGluZGV4KSB7XG5cdFx0dmFyIHF1ZXN0ID0gJHNjb3BlLnF1ZXN0c1tpbmRleF07XG5cdFx0cXVlc3Quc2hvd0RldGFpbCA9ICFxdWVzdC5zaG93RGV0YWlsO1xuXHR9O1xuXHQkc2NvcGUuc3dpdGNoQWN0aXZlID0gZnVuY3Rpb24gKHF1ZXN0Q2xpY2tlZCkge1xuXHRcdFF1ZXN0RmFjdG9yeS5zYXZlKHF1ZXN0Q2xpY2tlZCk7XG5cdH07XG59KTtcblxuIiwiYXBwLmZhY3RvcnkoJ1F1ZXN0RmFjdG9yeScsIGZ1bmN0aW9uICgkaHR0cCwgU2Vzc2lvbikge1xuXG5cdHJldHVybiB7XG5cblx0XHRnZXRBbGxRdWVzdHM6IGZ1bmN0aW9uKCkge1xuXHRcdFx0cmV0dXJuICRodHRwLmdldCgnL2FwaS9xdWVzdHMnKVxuXHRcdFx0LnRoZW4oZnVuY3Rpb24ocmVzKSB7XG5cdFx0XHRcdHJldHVybiByZXMuZGF0YTtcblx0XHRcdH0pO1xuXHRcdH0sXG5cdFx0Z2V0T25lUXVlc3Q6IGZ1bmN0aW9uKHF1ZXN0SWQpe1xuXHRcdFx0cmV0dXJuICRodHRwLmdldCgnL2FwaS9xdWVzdHMvJyArIHF1ZXN0SWQpXG5cdFx0XHRcdC50aGVuKGZ1bmN0aW9uKHJlcyl7XG5cdFx0XHRcdFx0cmV0dXJuIHJlcy5kYXRhO1xuXHRcdFx0XHR9KTtcblx0XHR9LFxuXHRcdGdldFVzZXJRdWVzdHM6IGZ1bmN0aW9uKHVzZXJJZCkge1xuXHRcdFx0cmV0dXJuICRodHRwLmdldCgnL2FwaS9xdWVzdHMvdXNlcnF1ZXN0cy8nICsgdXNlcklkKVxuXHRcdFx0LnRoZW4oZnVuY3Rpb24ocmVzKXtcblx0XHRcdFx0cmV0dXJuIHJlcy5kYXRhO1xuXHRcdFx0fSk7XG5cdFx0fSxcblx0XHRzYXZlOiBmdW5jdGlvbiAocXVlc3QpIHtcblx0XHRcdHJldHVybiAkaHR0cC5wdXQoJy9hcGkvcXVlc3RzLycgKyBxdWVzdC5faWQsIHF1ZXN0KVxuXHRcdFx0LnRoZW4oZnVuY3Rpb24gKHJlcyl7XG5cdFx0XHRcdHJldHVybiByZXMuZGF0YTtcblx0XHRcdH0pO1xuXHRcdH0sXG5cdFx0c2F2ZU5ldzogZnVuY3Rpb24gKHF1ZXN0KSB7XG5cdFx0XHRxdWVzdC5hdXRob3IgPSBTZXNzaW9uLnVzZXIuX2lkO1xuXHRcdFx0cmV0dXJuICRodHRwLnBvc3QoJy9hcGkvcXVlc3RzLycsIHF1ZXN0KVxuXHRcdFx0LnRoZW4oZnVuY3Rpb24gKHJlcykge1xuXHRcdFx0XHRyZXR1cm4gcmVzLmRhdGE7XG5cdFx0XHR9KTtcblx0XHR9LFxuXHRcdGRlbGV0ZTogZnVuY3Rpb24gKHF1ZXN0KSB7XG5cdFx0XHRyZXR1cm4gJGh0dHAuZGVsZXRlKCcvYXBpL3F1ZXN0cy8nICsgcXVlc3QuX2lkKTtcblx0XHR9XG5cdH07XG59KTtcbiIsImFwcC5kaXJlY3RpdmUoJ2JsdWVIZWFkZXInLCBmdW5jdGlvbihBdXRoU2VydmljZSwgJHN0YXRlKSB7XG5cdFxuXHRyZXR1cm4ge1xuXHRcdHJlc3RyaWN0OiAnRScsXG5cdFx0c2NvcGU6IHtcblx0XHRcdGhlYWQ6ICdAJyxcblx0XHRcdHNtYWxsOiAnQCdcblx0XHR9LFxuXHRcdHRlbXBsYXRlVXJsOiAnanMvY29tbW9uL2RpcmVjdGl2ZXMvYmx1ZS1oZWFkZXIvYmx1ZS1oZWFkZXIuaHRtbCcsXG5cdFx0bGluazogZnVuY3Rpb24oc2NvcGUpIHtcblxuXHRcdFx0c2NvcGUudXNlciA9IG51bGw7XG5cblx0XHRcdHZhciBzZXRVc2VyID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIEF1dGhTZXJ2aWNlLmdldExvZ2dlZEluVXNlcigpLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgc2NvcGUudXNlciA9IHVzZXI7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBzZXRVc2VyKCk7XG5cblx0XHRcdHNjb3BlLmxvZ291dCA9IGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRBdXRoU2VydmljZS5sb2dvdXQoKVxuXHRcdFx0XHQudGhlbihmdW5jdGlvbigpIHtcblx0XHRcdFx0XHQkc3RhdGUuZ28oJ2hvbWUnKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9O1xuXG5cdFx0fVxuXHR9O1xuXG59KTsiLCJhcHAuZGlyZWN0aXZlKCdmdWxsc3RhY2tMb2dvJywgZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB7XG4gICAgICAgIHJlc3RyaWN0OiAnRScsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAnanMvY29tbW9uL2RpcmVjdGl2ZXMvZnVsbHN0YWNrLWxvZ28vZnVsbHN0YWNrLWxvZ28uaHRtbCdcbiAgICB9O1xufSk7IiwiYXBwLmRpcmVjdGl2ZSgncmVzb2x2ZUxvYWRlcicsIGZ1bmN0aW9uKCRyb290U2NvcGUsICR0aW1lb3V0KSB7XG5cbiAgcmV0dXJuIHtcbiAgICByZXN0cmljdDogJ0UnLFxuICAgIHJlcGxhY2U6IHRydWUsXG4gICAgdGVtcGxhdGU6ICc8ZGl2IGNsYXNzPVwiYWxlcnQgYWxlcnQtc3VjY2VzcyBuZy1oaWRlXCI+PHN0cm9uZz5XZWxjb21lITwvc3Ryb25nPiBMb2FkaW5nIHVwISA8L2Rpdj4nLFxuICAgIGxpbms6IGZ1bmN0aW9uKHNjb3BlLCBlbGVtZW50KSB7XG5cbiAgICAgICRyb290U2NvcGUuJG9uKCckcm91dGVDaGFuZ2VTdGFydCcsIGZ1bmN0aW9uKGV2ZW50LCBjdXJyZW50Um91dGUsIHByZXZpb3VzUm91dGUpIHtcbiAgICAgICAgaWYgKHByZXZpb3VzUm91dGUpIHJldHVybjtcblxuICAgICAgICAkdGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICBlbGVtZW50LnJlbW92ZUNsYXNzKCduZy1oaWRlJyk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG5cbiAgICAgICRyb290U2NvcGUuJG9uKCckcm91dGVDaGFuZ2VTdWNjZXNzJywgZnVuY3Rpb24oKSB7XG4gICAgICAgIGVsZW1lbnQuYWRkQ2xhc3MoJ25nLWhpZGUnKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfTtcbn0pOyIsImFwcC5kaXJlY3RpdmUoJ25hdmJhcicsIGZ1bmN0aW9uICgkcm9vdFNjb3BlLCBBdXRoU2VydmljZSwgQVVUSF9FVkVOVFMsICRzdGF0ZSkge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgcmVzdHJpY3Q6ICdFJyxcbiAgICAgICAgc2NvcGU6IHtcbiAgICAgICAgICAgIGhvbWU6ICc9JyxcbiAgICAgICAgICAgIGRhc2hib2FyZDogJz0nXG4gICAgICAgIH0sXG4gICAgICAgIHRlbXBsYXRlVXJsOiAnanMvY29tbW9uL2RpcmVjdGl2ZXMvbmF2YmFyL25hdmJhci5odG1sJyxcbiAgICAgICAgbGluazogZnVuY3Rpb24gKHNjb3BlKSB7XG5cbiAgICAgICAgICAgIHNjb3BlLml0ZW1zID0gW1xuICAgICAgICAgICAgICAgIHsgbGFiZWw6ICdEYXNoYm9hcmQnLCBzdGF0ZTogJ2hvbWUnICwgYXV0aDogdHJ1ZX0sXG4gICAgICAgICAgICAgICAgeyBsYWJlbDogJ05ldyBRdWVzdCcsIHN0YXRlOiAnZWRpdG9yJywgYXV0aDogdHJ1ZSB9XG4gICAgICAgICAgICBdO1xuXG4gICAgICAgICAgICBzY29wZS51c2VyID0gbnVsbDtcblxuICAgICAgICAgICAgc2NvcGUuaXNMb2dnZWRJbiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gQXV0aFNlcnZpY2UuaXNBdXRoZW50aWNhdGVkKCk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICB2YXIgc2V0VXNlciA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBBdXRoU2VydmljZS5nZXRMb2dnZWRJblVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgICAgICAgICAgICAgIHNjb3BlLnVzZXIgPSB1c2VyO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgdmFyIHJlbW92ZVVzZXIgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgc2NvcGUudXNlciA9IG51bGw7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBzZXRVc2VyKCk7XG5cbiAgICAgICAgICAgICRyb290U2NvcGUuJG9uKEFVVEhfRVZFTlRTLmxvZ2luU3VjY2Vzcywgc2V0VXNlcik7XG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRvbihBVVRIX0VWRU5UUy5sb2dvdXRTdWNjZXNzLCByZW1vdmVVc2VyKTtcbiAgICAgICAgICAgICRyb290U2NvcGUuJG9uKEFVVEhfRVZFTlRTLnNlc3Npb25UaW1lb3V0LCByZW1vdmVVc2VyKTtcblxuICAgICAgICAgICAgLy8gUHJldHR5IFNjcm9sbGluZyBOYXZiYXIgRWZmZWN0XG4gICAgICAgICAgICAkKHdpbmRvdykuc2Nyb2xsKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIGlmICgkKCcubmF2YmFyJykub2Zmc2V0KCkudG9wID4gNTAgJiYgc2NvcGUuaG9tZSkge1xuICAgICAgICAgICAgICAgICAgICAkKCcubmF2YmFyLWZpeGVkLXRvcCcpLmFkZENsYXNzKCd0b3AtbmF2LWNvbGxhcHNlJyk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdkb29vb3d3d3d3bicpXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChzY29wZS5ob21lKSB7XG4gICAgICAgICAgICAgICAgICAgICQoJy5uYXZiYXItZml4ZWQtdG9wJykucmVtb3ZlQ2xhc3MoJ3RvcC1uYXYtY29sbGFwc2UnKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ3V1dXV1dXVwJylcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gQW5pbWF0ZWQgU2Nyb2xsIFRvIFNlY3Rpb25cbiAgICAgICAgICAgICQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgJCgnLnBhZ2Utc2Nyb2xsIGEnKS5iaW5kKCdjbGljaycsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgJGFuY2hvciA9ICQodGhpcyk7XG4gICAgICAgICAgICAgICAgICAgICQoJ2h0bWwsIGJvZHknKS5zdG9wKCkuYW5pbWF0ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICBzY3JvbGxUb3A6ICQoJGFuY2hvci5hdHRyKCdocmVmJykpLm9mZnNldCgpLnRvcFxuICAgICAgICAgICAgICAgICAgICB9LCAxNTAwLCAnZWFzZUluT3V0RXhwbycpO1xuICAgICAgICAgICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgfVxuXG4gICAgfTtcblxufSk7XG4iXSwic291cmNlUm9vdCI6Ii9zb3VyY2UvIn0=
