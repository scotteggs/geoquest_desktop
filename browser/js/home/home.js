app.config(function ($stateProvider) {
    $stateProvider.state('home', {
        url: '/',
        templateUrl: 'js/home/home.html',
        controller: 'HomeCtrl',
        resolve: {
        	quests: function(QuestFactory) {
        		return QuestFactory.getAllQuests();
        	}
        }
    });
});

app.controller('HomeCtrl', function($scope, quests) {
    $scope.quests = quests;
});